'use client';

import { useEffect, useRef, useState } from 'react';
import { WsNotificationServerFrameSchema, type Notification } from '@carpool/schemas';
import { env } from '@/lib/env';

/** Must match apps/api/src/realtime/messages-ws.ts — auth failed, do not reconnect. */
const WS_CLOSE_UNAUTHORIZED = 4001;

export type NotificationsSocketStatus =
  | 'disabled'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'fallback';

export type UseNotificationsSocketOptions = {
  enabled?: boolean;
  /** Optional bearer for `?token=` — browsers rely on the API session cookie by default. */
  token?: string;
  onNotification: (notification: Notification) => void;
};

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Resolve the notifications WebSocket URL, derived from `NEXT_PUBLIC_API_URL`
 * (unlike the messages socket, this doesn't honor `NEXT_PUBLIC_WS_URL` — that
 * env var is documented/typed today as the full `/ws/messages` URL).
 */
export function resolveNotificationsWsUrl(): string | undefined {
  try {
    const url = new URL(env.NEXT_PUBLIC_API_URL);
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
 * `GET /ws/notifications`. Contract (see `@carpool/schemas`
 * WsNotificationClientFrame / WsNotificationServerFrame):
 * - Server → `{ type: "ready" }` once authenticated, then
 *   `{ type: "notification.created", notification }` as they arrive.
 *
 * Status is `connected` only after `ready` — until then (and on error) the
 * UI should keep REST polling. When the socket is unavailable, status
 * becomes `fallback`.
 */
export function useNotificationsSocket({
  enabled = true,
  token,
  onNotification,
}: UseNotificationsSocketOptions): { status: NotificationsSocketStatus } {
  const wsBase = resolveNotificationsWsUrl();
  const [status, setStatus] = useState<NotificationsSocketStatus>(() =>
    wsBase ? 'connecting' : 'fallback',
  );
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
        // Stay in connecting until `ready` — open alone is not live.
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
  }, [enabled, token, wsBase]);

  return { status };
}
