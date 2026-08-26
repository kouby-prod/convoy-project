import { useEffect, useRef, useState } from 'react';
import { WsNotificationServerFrameSchema, type Notification } from '@carpool/schemas';
import { env } from '@/lib/env';
import { getSessionCookie } from '@/lib/api-client';

/** Must match apps/api/src/realtime/messages-ws.ts — auth failed, do not reconnect. */
const WS_CLOSE_UNAUTHORIZED = 4001;

export type NotificationsSocketStatus = 'disabled' | 'connecting' | 'connected' | 'reconnecting' | 'fallback';

export type UseNotificationsSocketOptions = {
  enabled?: boolean;
  onNotification: (notification: Notification) => void;
};

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * React Native's `WebSocket` accepts a third `{ headers }` constructor
 * argument at runtime (an RN-only extension implemented natively — see
 * `react-native/Libraries/WebSocket/WebSocket.js`), but TypeScript resolves
 * the global `WebSocket` type from `lib.dom.d.ts` (RN ships no override),
 * whose constructor only declares `(url, protocols)`. This narrows just
 * enough to pass the real third argument without widening the global type.
 */
type RNWebSocketConstructor = new (
  url: string,
  protocols?: string | string[],
  options?: { headers?: Record<string, string> },
) => WebSocket;
const RNWebSocket = WebSocket as unknown as RNWebSocketConstructor;

function resolveNotificationsWsUrl(): string | undefined {
  try {
    const url = new URL(env.EXPO_PUBLIC_API_URL);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws/notifications';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

/**
 * Live fan-out for the caller's own notifications against
 * `GET /ws/notifications` — mobile counterpart of the web's
 * `useNotificationsSocket`. Browsers cannot attach a `Cookie` header to a
 * WebSocket upgrade, hence the web hook's `?token=` query param; React
 * Native's `WebSocket` accepts a third `{ headers }` argument instead, so
 * this attaches the same session cookie the REST client already sends
 * (see `lib/api-client.ts`).
 */
export function useNotificationsSocket({
  enabled = true,
  onNotification,
}: UseNotificationsSocketOptions): { status: NotificationsSocketStatus } {
  const wsBase = resolveNotificationsWsUrl();
  const [status, setStatus] = useState<NotificationsSocketStatus>(() => (wsBase ? 'connecting' : 'fallback'));
  const onNotificationRef = useRef(onNotification);
  onNotificationRef.current = onNotification;

  useEffect(() => {
    if (!enabled || !wsBase) {
      setStatus('fallback');
      return;
    }

    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let backoffMs = INITIAL_BACKOFF_MS;
    let attempt = 0;

    const clearTimers = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = undefined;
      }
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      clearTimers();
      setStatus(attempt === 0 ? 'connecting' : 'reconnecting');
      reconnectTimer = setTimeout(connect, backoffMs);
      backoffMs = Math.min(MAX_BACKOFF_MS, backoffMs * 2);
      attempt += 1;
      if (attempt >= 5) setStatus('fallback');
    };

    const connect = () => {
      if (cancelled) return;
      clearTimers();
      setStatus(attempt === 0 ? 'connecting' : 'reconnecting');

      const cookie = getSessionCookie();
      try {
        socket = new RNWebSocket(wsBase, undefined, cookie ? { headers: { Cookie: cookie } } : undefined);
      } catch {
        setStatus('fallback');
        return;
      }

      socket.addEventListener('open', () => {
        if (cancelled) return;
        setStatus('connecting');
        pingTimer = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25_000);
      });

      socket.addEventListener('message', (event) => {
        if (cancelled || typeof event.data !== 'string') return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }
        const frame = WsNotificationServerFrameSchema.safeParse(parsed);
        if (!frame.success) return;

        if (frame.data.type === 'ready') {
          backoffMs = INITIAL_BACKOFF_MS;
          attempt = 0;
          setStatus('connected');
          return;
        }

        if (frame.data.type === 'error') {
          setStatus('fallback');
          return;
        }

        if (frame.data.type !== 'notification.created') return;
        onNotificationRef.current(frame.data.notification);
      });

      socket.addEventListener('close', (event) => {
        if (cancelled) return;
        if (event.code === WS_CLOSE_UNAUTHORIZED) {
          setStatus('fallback');
          return;
        }
        scheduleReconnect();
      });

      socket.addEventListener('error', () => {
        socket?.close();
      });
    };

    connect();

    return () => {
      cancelled = true;
      clearTimers();
      socket?.close();
    };
  }, [enabled, wsBase]);

  return { status };
}
