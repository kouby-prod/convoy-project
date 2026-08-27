'use client';

import { useEffect, useRef, useState } from 'react';
import { WsLocationServerFrameSchema, type LiveLocation } from '@carpool/schemas';
import { env } from '@/lib/env';

/** Must match apps/api/src/realtime/messages-ws.ts — auth failed, do not reconnect. */
const WS_CLOSE_UNAUTHORIZED = 4001;

export type TrajetLocationSocketStatus =
  | 'disabled'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'fallback';

export type UseTrajetLocationSocketOptions = {
  trajetId: string;
  enabled?: boolean;
  /** Optional bearer for `?token=` — browsers rely on the API session cookie by default. */
  token?: string;
  onLocation: (location: LiveLocation) => void;
  onStopped: () => void;
};

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

/** Derives `ws(s)://<api-host>/ws/location` from `NEXT_PUBLIC_API_URL`. */
export function resolveLocationWsUrl(): string | undefined {
  try {
    const url = new URL(env.NEXT_PUBLIC_API_URL);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws/location';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

/**
 * Live driver position for one trajet against `GET /ws/location`.
 * Contract (see `@carpool/schemas` WsLocationClientFrame / WsLocationServerFrame):
 * - Client → `{ type: "subscribe", trajetId }`
 * - Server → `{ type: "subscribed", trajetId }` then
 *   `{ type: "location.updated", trajetId, location }` /
 *   `{ type: "location.stopped", trajetId }`
 *
 * Status is `connected` only after a matching `subscribed` ack — until then
 * (and on error) the UI should keep REST polling. When the socket is
 * unavailable, status becomes `fallback`.
 */
export function useTrajetLocationSocket({
  trajetId,
  enabled = true,
  token,
  onLocation,
  onStopped,
}: UseTrajetLocationSocketOptions): { status: TrajetLocationSocketStatus } {
  const wsBase = resolveLocationWsUrl();
  const [status, setStatus] = useState<TrajetLocationSocketStatus>(() =>
    wsBase ? 'connecting' : 'fallback',
  );
  const onLocationRef = useRef(onLocation);
  onLocationRef.current = onLocation;
  const onStoppedRef = useRef(onStopped);
  onStoppedRef.current = onStopped;

  useEffect(() => {
    if (!enabled || !trajetId || !wsBase) {
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
        socket?.send(JSON.stringify({ type: 'subscribe', trajetId }));
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
        const frame = WsLocationServerFrameSchema.safeParse(parsed);
        if (!frame.success) return;

        if (frame.data.type === 'subscribed' && frame.data.trajetId === trajetId) {
          backoffMs = INITIAL_BACKOFF_MS;
          attempt = 0;
          subscribed = true;
          setStatus('connected');
          return;
        }

        if (frame.data.type === 'error') {
          // Auth/access failures: fall back to REST and retry via the same
          // backoff as a real disconnect (the 'close' listener below) rather
          // than abandoning this socket — the access window (sharing opens
          // 2h before departure) or the booking's confirmation can become
          // valid later without the page being reloaded.
          subscribed = false;
          socket?.close();
          return;
        }

        if (frame.data.type === 'location.updated' && frame.data.trajetId === trajetId) {
          onLocationRef.current(frame.data.location);
          return;
        }

        if (frame.data.type === 'location.stopped' && frame.data.trajetId === trajetId) {
          onStoppedRef.current();
        }
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
        socket.send(JSON.stringify({ type: 'unsubscribe', trajetId }));
      }
      socket?.close();
    };
  }, [trajetId, enabled, token, wsBase]);

  return { status };
}
