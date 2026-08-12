'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { createApiClient } from '@carpool/api-client';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Filter } from 'lucide-react';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function NotificationsList() {
  const t = useTranslations('Notifications');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [page, setPage] = useState(1);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  useEffect(() => {
    if (!isSessionPending && !session?.user) router.push('/sign-in');
  }, [isSessionPending, router, session?.user]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['notifications', page],
    enabled: !!session?.user,
    queryFn: async () => {
      const res = await api.notifications.$get({ query: { page, limit: 20 } as any });
      if (!res.ok) throw new Error('Failed to load notifications');
      return res.json();
    },
  });

  const filteredItems = data?.items.filter((n) => (showUnreadOnly ? !n.readAt : true)) ?? [];

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await api.notifications[':id'].read.$patch({
        param: { id: notificationId },
      });
      if (!res.ok) throw new Error('Failed to mark as read');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unreadCount'] });
    },
  });

  if (isSessionPending || !session?.user)
    return <p className="text-muted-foreground">{t('loading')}</p>;
  if (isLoading) return <p className="text-muted-foreground">{t('loading')}</p>;
  if (isError) return <p className="text-destructive">{t('error')}</p>;
  if (!data?.items.length) return <p className="text-muted-foreground">{t('empty')}</p>;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <Button
          variant={showUnreadOnly ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setShowUnreadOnly((prev) => !prev)}
          className="gap-2"
        >
          <Filter className="size-4" strokeWidth={2.25} />
          {showUnreadOnly ? t('filterUnreadActive') : t('filterUnread')}
        </Button>
        {data.unreadCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {t('unreadCount', { count: data.unreadCount })}
          </p>
        )}
      </div>
      {filteredItems.length === 0 && showUnreadOnly ? (
        <p className="text-muted-foreground">{t('noUnread')}</p>
      ) : (
        <ul className="grid gap-4">
          {filteredItems.map((notification) => (
          <li key={notification.id}>
            <Card className={notification.readAt ? 'opacity-75' : ''}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <CardTitle>{notification.title}</CardTitle>
                  </div>
                  {!notification.readAt && <Badge>{t('unread')}</Badge>}
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 px-6 pb-6 pt-0 text-sm">
                <p className="text-muted-foreground">{notification.body}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(notification.createdAt)}
                  </span>
                  {!notification.readAt && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={markReadMutation.isPending}
                      onClick={() => markReadMutation.mutate(notification.id)}
                    >
                      {markReadMutation.isPending ? t('marking') : t('markRead')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
        </ul>
      )}

      {data.hasMore && !showUnreadOnly && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setPage((p) => p + 1)}
          disabled={isLoading}
        >
          {t('loadMore')}
        </Button>
      )}
    </div>
  );
}
