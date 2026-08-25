'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { fetchConversations } from '@/lib/conversations';
import {
  loadReadMap,
  markBookingRead,
  subscribeReadMap,
  unreadThreadCount,
} from '@/lib/message-read';

/** Last-read map for the signed-in user; updates across inbox, navbar, driver queue. */
export function useMessageReadMap() {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;
  const [readMap, setReadMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!userId) {
      setReadMap({});
      return;
    }
    const refresh = () => setReadMap(loadReadMap(userId));
    refresh();
    return subscribeReadMap(refresh);
  }, [userId]);

  const markRead = useCallback(
    (bookingId: string) => {
      if (!userId) return;
      markBookingRead(userId, bookingId);
    },
    [userId],
  );

  return { userId, readMap, markRead };
}

/** Total unread booking threads — drives the navbar badge. */
export function useInboxUnreadCount() {
  const { userId, readMap } = useMessageReadMap();
  const { data } = useQuery({
    queryKey: ['messages', 'inbox'],
    enabled: !!userId,
    queryFn: fetchConversations,
    staleTime: 30_000,
  });
  return useMemo(() => unreadThreadCount(data ?? [], userId, readMap), [data, userId, readMap]);
}
