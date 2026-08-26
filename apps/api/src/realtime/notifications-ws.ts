import { randomUUID } from 'crypto';
import { upgradeWebSocket } from '@hono/node-server';
import { WsNotificationClientFrameSchema, type WsNotificationServerFrame } from '@carpool/schemas';
import { auth } from '../auth';
import { notificationHub } from './notification-hub';
import { WS_CLOSE_UNAUTHORIZED } from './messages-ws';

async function sessionFromUpgrade(raw: Request, tokenQuery: string | undefined) {
  const headers = new Headers(raw.headers);
  if (tokenQuery && !headers.get('authorization')) {
    headers.set('Authorization', `Bearer ${tokenQuery}`);
  }
  return auth.api.getSession({ headers });
}

function sendFrame(send: (data: string) => void, frame: WsNotificationServerFrame) {
  send(JSON.stringify(frame));
}

/**
 * `GET /ws/notifications` — authenticated WebSocket for live notification
 * delivery. No subscribe step: once connected, the socket receives every
 * notification created for the authenticated user (see
 * `realtime/notification-hub.ts` + `modules/notification/events.ts`).
 *
 * Unauthenticated upgrades are accepted then closed with
 * {@link WS_CLOSE_UNAUTHORIZED} — browsers swallow HTTP 401 on failed
 * handshakes, so a structured close is the reliable auth signal.
 */
export const notificationsWebSocketHandler = upgradeWebSocket(async (c) => {
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
      notificationHub.register(socketId, userId, {
        send: (data) => ws.send(data),
      });
      sendFrame((data) => ws.send(data), { type: 'ready' });
    },

    onMessage(event, ws) {
      const raw = typeof event.data === 'string' ? event.data : String(event.data);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        sendFrame((data) => ws.send(data), { type: 'error', error: 'Invalid JSON frame' });
        return;
      }

      const frameResult = WsNotificationClientFrameSchema.safeParse(parsed);
      if (!frameResult.success) {
        sendFrame((data) => ws.send(data), { type: 'error', error: 'Invalid frame' });
        return;
      }

      if (frameResult.data.type === 'ping') {
        sendFrame((data) => ws.send(data), { type: 'pong' });
      }
    },

    onClose() {
      notificationHub.unregister(socketId, userId);
    },

    onError() {
      notificationHub.unregister(socketId, userId);
    },
  };
});
