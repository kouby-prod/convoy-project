import { useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LiveLocation } from '@carpool/schemas';
import { fetchLiveLocation } from '@/lib/tracking';
import { useTrajetLocationSocket } from './useTrajetLocationSocket';

const POLL_INTERVAL_MS = 15_000;

/**
 * Live driver position for one trajet, backed by `GET /trajets/:id/location`
 * with a WebSocket keeping it fresh — mobile counterpart of the web's
 * `useTrajetLiveLocation`. REST polling only kicks in while the socket isn't
 * `connected`.
 */
export function useTrajetLiveLocation(trajetId: string, options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  const queryClient = useQueryClient();
  const queryKey = ['trajets', trajetId, 'location'] as const;
  const socketStatusRef = useRef<'connected' | 'other'>('other');

  const { data } = useQuery({
    queryKey,
    enabled,
    queryFn: () => fetchLiveLocation(trajetId),
    refetchInterval: () => {
      if (!enabled) return false;
      return socketStatusRef.current === 'connected' ? false : POLL_INTERVAL_MS;
    },
  });

  const { status } = useTrajetLocationSocket({
    trajetId,
    enabled,
    onLocation: (location: LiveLocation) => {
      queryClient.setQueryData<LiveLocation | null>(queryKey, location);
    },
    onStopped: () => {
      queryClient.setQueryData<LiveLocation | null>(queryKey, null);
    },
  });

  socketStatusRef.current = status === 'connected' ? 'connected' : 'other';

  return { location: data ?? null, status };
}
