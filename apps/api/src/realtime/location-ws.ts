import { randomUUID } from 'crypto';
import { upgradeWebSocket } from '@hono/node-server';
import { WsLocationClientFrameSchema, type WsLocationServerFrame } from '@carpool/schemas';
import { auth } from '../auth';
import { resolveTrajetLocationAccess } from '../modules/tracking/access';
import { locationHub } from './location-hub';
import { WS_CLOSE_UNAUTHORIZED } from './messages-ws';

async function sessionFromUpgrade(raw: Request, tokenQuery: string | undefined) {
  const headers = new Headers(raw.headers);
  if (tokenQuery && !headers.get('authorization')) {
    headers.set('Authorization', `Bearer ${tokenQuery}`);
  }
  return auth.api.getSession({ headers });
}

function sendFrame(send: (data: string) => void, frame: WsLocationServerFrame) {
  send(JSON.stringify(frame));
}

/**
 * `GET /ws/location` — authenticated WebSocket for live driver positions.
 * Clients send `{ type: "subscribe", trajetId }` after connect; the server
 * pushes `{ type: "location.updated" | "location.stopped", ... }` as the
 * driver pings (see the direct Redis publish in modules/tracking/index.ts +
 * realtime/location-hub.ts). Same subscribe/unsubscribe shape as
 * `/ws/messages`, scoped to a trajet instead of a booking.
 *
 * Unauthenticated upgrades are accepted then closed with
 * {@link WS_CLOSE_UNAUTHORIZED} — browsers swallow HTTP 401 on failed
 * handshakes, so a structured close is the reliable auth signal.
 */
export const locationWebSocketHandler = upgradeWebSocket(async (c) => {
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
      locationHub.register(socketId, userId, {
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

      const frameResult = WsLocationClientFrameSchema.safeParse(parsed);
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
        locationHub.unsubscribe(socketId, frame.trajetId);
        sendFrame((data) => ws.send(data), { type: 'unsubscribed', trajetId: frame.trajetId });
        return;
      }

      let access: Awaited<ReturnType<typeof resolveTrajetLocationAccess>>;
      try {
        access = await resolveTrajetLocationAccess(frame.trajetId, userId);
      } catch (err) {
        console.error('[location-ws] access check failed', err);
        sendFrame((data) => ws.send(data), {
          type: 'error',
          error: 'Access check failed',
          trajetId: frame.trajetId,
        });
        return;
      }

      if (!access.ok) {
        sendFrame((data) => ws.send(data), {
          type: 'error',
          error: access.error,
          trajetId: frame.trajetId,
        });
        return;
      }

      locationHub.subscribe(socketId, frame.trajetId);
      sendFrame((data) => ws.send(data), { type: 'subscribed', trajetId: frame.trajetId });
    },

    onClose() {
      locationHub.unregister(socketId);
    },

    onError() {
      locationHub.unregister(socketId);
    },
  };
});
