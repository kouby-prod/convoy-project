import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { loadReadMap, markBookingRead, type ReadMap } from '@/lib/message-read';

/**
 * Last-read map for the signed-in user, shared via the query cache so the
 * inbox list, the tab badge and an open thread all update together the
 * moment any of them calls `markRead` — no cross-window event needed like
 * the web hook's `storage` listener, since they already share one
 * `QueryClient` in this app.
 */
export function useMessageReadMap() {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;
  const queryKey = ['message-read-map', userId] as const;

  const { data: readMap } = useQuery({
    queryKey,
    queryFn: () => loadReadMap(userId as string),
    enabled: !!userId,
  });

  const markRead = useCallback(
    (bookingId: string) => {
      if (!userId) return;
      void markBookingRead(userId, bookingId).then((next) => {
        queryClient.setQueryData<ReadMap>(queryKey, next);
      });
    },
    [userId, queryClient, queryKey],
  );

  return { userId, readMap: readMap ?? {}, markRead };
}
