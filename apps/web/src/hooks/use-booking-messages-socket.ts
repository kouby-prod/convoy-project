'use client';

import { useEffect, useRef, useState } from 'react';
import { WsServerFrameSchema, type Message } from '@carpool/schemas';
import { env } from '@/lib/env';

/** Must match apps/api/src/realtime/messages-ws.ts — auth failed, do not reconnect. */
const WS_CLOSE_UNAUTHORIZED = 4001;

export type BookingMessagesSocketStatus =
  | 'disabled'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'fallback';

export type UseBookingMessagesSocketOptions = {
  bookingId: string;
  enabled?: boolean;
  /** Optional bearer for `?token=` — browsers rely on the API session cookie by default. */
  token?: string;
  onMessage: (message: Message) => void;
};

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Resolve the messages WebSocket URL.
 * Prefer `NEXT_PUBLIC_WS_URL`; otherwise derive `ws(s)://<api-host>/ws/messages`
 * from `NEXT_PUBLIC_API_URL` so local Docker works without an extra env var.
 */
export function resolveMessagesWsUrl(): string | undefined {
  if (env.NEXT_PUBLIC_WS_URL) return env.NEXT_PUBLIC_WS_URL;
  try {
    const url = new URL(env.NEXT_PUBLIC_API_URL);
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
 * Live fan-out for one booking thread against `GET /ws/messages`.
 * Contract (see `@carpool/schemas` WsClientFrame / WsServerFrame):
 * - Client → `{ type: "subscribe", bookingId }`
 * - Server → `{ type: "subscribed", bookingId }` then `{ type: "message.created", message }`
 *
 * Status is `connected` only after a matching `subscribed` ack — until then
 * (and on error) the UI should keep REST polling. When the socket is
 * unavailable, status becomes `fallback`.
 */
export function useBookingMessagesSocket({
  bookingId,
  enabled = true,
  token,
  onMessage,
}: UseBookingMessagesSocketOptions): { status: BookingMessagesSocketStatus } {
  const wsBase = resolveMessagesWsUrl();
  const [status, setStatus] = useState<BookingMessagesSocketStatus>(() =>
    wsBase ? 'connecting' : 'fallback',
  );
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

      try {
        const url = new URL(wsBase);
        if (token) url.searchParams.set('token', token);
        socket = new WebSocket(url.toString());
      } catch {
        setStatus('fallback');
        return;
      }

      socket.addEventListener('open', () => {
        if (cancelled) return;
        // Stay in connecting until `subscribed` — open alone is not live.
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
          // Auth/access failures: fall back to REST; do not claim live.
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
      if (socket && socket.readyState === WebSocket.OPEN) {
        if (subscribed) {
          socket.send(JSON.stringify({ type: 'unsubscribe', bookingId }));
        }
      }
      socket?.close();
    };
  }, [bookingId, enabled, token, wsBase]);

  return { status };
}
