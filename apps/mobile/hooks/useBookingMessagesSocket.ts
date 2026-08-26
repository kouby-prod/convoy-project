import { useEffect, useRef, useState } from 'react';
import { WsServerFrameSchema, type Message } from '@carpool/schemas';
import { env } from '@/lib/env';
import { getSessionCookie } from '@/lib/api-client';

/** Must match apps/api/src/realtime/messages-ws.ts — auth failed, do not reconnect. */
const WS_CLOSE_UNAUTHORIZED = 4001;

export type BookingMessagesSocketStatus = 'disabled' | 'connecting' | 'connected' | 'reconnecting' | 'fallback';

export type UseBookingMessagesSocketOptions = {
  bookingId: string;
  enabled?: boolean;
  onMessage: (message: Message) => void;
};

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/** See useNotificationsSocket.ts for why this cast exists. */
type RNWebSocketConstructor = new (
  url: string,
  protocols?: string | string[],
  options?: { headers?: Record<string, string> },
) => WebSocket;
const RNWebSocket = WebSocket as unknown as RNWebSocketConstructor;

function resolveMessagesWsUrl(): string | undefined {
  try {
    const url = new URL(env.EXPO_PUBLIC_API_URL);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws/messages';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

/**
 * Live fan-out for one booking thread against `GET /ws/messages` — mobile
 * counterpart of the web's `useBookingMessagesSocket`. See
 * `useNotificationsSocket.ts` for why this attaches a `Cookie` header
 * instead of the web hook's `?token=` query param.
 */
export function useBookingMessagesSocket({
  bookingId,
  enabled = true,
  onMessage,
}: UseBookingMessagesSocketOptions): { status: BookingMessagesSocketStatus } {
  const wsBase = resolveMessagesWsUrl();
  const [status, setStatus] = useState<BookingMessagesSocketStatus>(() => (wsBase ? 'connecting' : 'fallback'));
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled || !bookingId || !wsBase) {
      setStatus('fallback');
      return;
    }

    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let backoffMs = INITIAL_BACKOFF_MS;
    let attempt = 0;
    let subscribed = false;

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
      subscribed = false;
      setStatus(attempt === 0 ? 'connecting' : 'reconnecting');
      reconnectTimer = setTimeout(connect, backoffMs);
      backoffMs = Math.min(MAX_BACKOFF_MS, backoffMs * 2);
      attempt += 1;
      if (attempt >= 5) setStatus('fallback');
    };

    const connect = () => {
      if (cancelled) return;
      clearTimers();
      subscribed = false;
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
        socket?.send(JSON.stringify({ type: 'subscribe', bookingId }));
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
        const frame = WsServerFrameSchema.safeParse(parsed);
        if (!frame.success) return;

        if (frame.data.type === 'subscribed' && frame.data.bookingId === bookingId) {
          backoffMs = INITIAL_BACKOFF_MS;
          attempt = 0;
          subscribed = true;
          setStatus('connected');
          return;
        }

        if (frame.data.type === 'error') {
          subscribed = false;
          setStatus('fallback');
          return;
        }

        if (frame.data.type !== 'message.created') return;
        if (frame.data.message.bookingId !== bookingId) return;
        onMessageRef.current(frame.data.message);
      });

      socket.addEventListener('close', (event) => {
        if (cancelled) return;
        subscribed = false;
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
      if (socket && socket.readyState === WebSocket.OPEN && subscribed) {
        socket.send(JSON.stringify({ type: 'unsubscribe', bookingId }));
      }
      socket?.close();
    };
  }, [bookingId, enabled, wsBase]);

  return { status };
}
