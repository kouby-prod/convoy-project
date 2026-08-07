import { randomUUID } from 'crypto';
import { upgradeWebSocket } from '@hono/node-server';
import { WsClientFrameSchema, type WsServerFrame } from '@carpool/schemas';
import { auth } from '../auth';
import { db } from '../db/client';
import { booking, trajet } from '../db/trajet-schema';
import { eq } from 'drizzle-orm';
import { messageHub } from './hub';

/** Application close code: auth failed — clients should not reconnect with the same token. */
export const WS_CLOSE_UNAUTHORIZED = 4001;

async function resolvePartyAccess(
  bookingId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [bookingRow] = await db.select().from(booking).where(eq(booking.id, bookingId));
  if (!bookingRow) return { ok: false, error: 'Booking not found' };

  const [trajetRow] = await db.select().from(trajet).where(eq(trajet.id, bookingRow.trajetId));
  if (!trajetRow) return { ok: false, error: 'Booking not found' };

  if (userId !== bookingRow.passengerId && userId !== trajetRow.driverId) {
    return { ok: false, error: 'Neither the passenger nor the driver of this booking' };
  }
  return { ok: true };
}

/**
 * Authenticate the upgrade using either:
 * - `Authorization: Bearer <token>` (or cookie session) on the HTTP request, or
 * - `?token=` query (browsers cannot set Authorization on WebSocket upgrades).
 */
async function sessionFromUpgrade(raw: Request, tokenQuery: string | undefined) {
  const headers = new Headers(raw.headers);
  if (tokenQuery && !headers.get('authorization')) {
    headers.set('Authorization', `Bearer ${tokenQuery}`);
  }
  return auth.api.getSession({ headers });
}

function sendFrame(send: (data: string) => void, frame: WsServerFrame) {
  send(JSON.stringify(frame));
}

/**
 * `GET /ws/messages` — authenticated WebSocket for live booking threads.
 * Clients send `{ type: "subscribe", bookingId }` after connect; the server
 * pushes `{ type: "message.created", message }` when the BullMQ worker
 * publishes to Redis (see queue/message-worker.ts + realtime/hub.ts).
 *
 * Unauthenticated upgrades are accepted then closed with {@link WS_CLOSE_UNAUTHORIZED}
 * — browsers swallow HTTP 401 on failed handshakes, so a structured close is
 * the reliable auth signal.
 */
export const messagesWebSocketHandler = upgradeWebSocket(async (c) => {
  const token = c.req.query('token');
  const session = await sessionFromUpgrade(c.req.raw, token);

  if (!session) {
    return {
      onOpen(_event, ws) {
        sendFrame((data) => ws.send(data), { type: 'error', error: 'Unauthorized' });
        ws.close(WS_CLOSE_UNAUTHORIZED, 'Unauthorized');
      },
    };
  }

  const userId = session.user.id;
  const socketId = randomUUID();

  return {
    onOpen(_event, ws) {
      messageHub.register(socketId, userId, {
        send: (data) => ws.send(data),
      });
    },

    async onMessage(event, ws) {
      const raw = typeof event.data === 'string' ? event.data : String(event.data);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        sendFrame((data) => ws.send(data), { type: 'error', error: 'Invalid JSON frame' });
        return;
      }

      const frameResult = WsClientFrameSchema.safeParse(parsed);
      if (!frameResult.success) {
        sendFrame((data) => ws.send(data), { type: 'error', error: 'Invalid frame' });
        return;
      }

      const frame = frameResult.data;
      if (frame.type === 'ping') {
        sendFrame((data) => ws.send(data), { type: 'pong' });
        return;
      }

      if (frame.type === 'unsubscribe') {
        messageHub.unsubscribe(socketId, frame.bookingId);
        sendFrame((data) => ws.send(data), { type: 'unsubscribed', bookingId: frame.bookingId });
        return;
      }

      let access: Awaited<ReturnType<typeof resolvePartyAccess>>;
      try {
        access = await resolvePartyAccess(frame.bookingId, userId);
      } catch (err) {
        console.error('[messages-ws] access check failed', err);
        sendFrame((data) => ws.send(data), {
          type: 'error',
          error: 'Access check failed',
          bookingId: frame.bookingId,
        });
        return;
      }

      if (!access.ok) {
        sendFrame((data) => ws.send(data), {
          type: 'error',
          error: access.error,
          bookingId: frame.bookingId,
        });
        return;
      }

      messageHub.subscribe(socketId, frame.bookingId);
      sendFrame((data) => ws.send(data), { type: 'subscribed', bookingId: frame.bookingId });
    },

    onClose() {
      messageHub.unregister(socketId);
    },

    onError() {
      messageHub.unregister(socketId);
    },
  };
});
