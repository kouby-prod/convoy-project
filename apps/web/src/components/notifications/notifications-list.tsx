'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { createApiClient } from '@carpool/api-client';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  Filter,
  ExternalLink,
  Check,
  BellOff,
  CalendarClock,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Info,
  type LucideProps,
} from 'lucide-react';
import type { Notification, NotificationType } from '@carpool/schemas';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

type DateBucket = 'today' | 'yesterday' | 'thisWeek' | 'earlier';

const TYPE_CONFIG: Record<
  NotificationType,
  { icon: ComponentType<LucideProps>; labelKey: string; accent: string; iconWrap: string }
> = {
  booking_request: {
    icon: CalendarClock,
    labelKey: 'typeBookingRequest',
    accent: 'bg-warning',
    iconWrap: 'bg-warning/25 text-warning-foreground',
  },
  booking_status: {
    icon: CheckCircle2,
    labelKey: 'typeBookingStatus',
    accent: 'bg-success',
    iconWrap: 'bg-success/15 text-success',
  },
  trip_cancelled: {
    icon: XCircle,
    labelKey: 'typeTripCancelled',
    accent: 'bg-destructive',
    iconWrap: 'bg-destructive/10 text-destructive',
  },
  message: {
    icon: MessageSquare,
    labelKey: 'typeMessage',
    accent: 'bg-brand-blue',
    iconWrap: 'bg-brand-blue/10 text-brand-blue',
  },
  system: {
    icon: Info,
    labelKey: 'typeSystem',
    accent: 'bg-muted-foreground',
    iconWrap: 'bg-muted text-muted-foreground',
  },
};

function dateBucketFor(date: Date, now: Date): DateBucket {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  if (date >= startOfToday) return 'today';
  if (date >= startOfYesterday) return 'yesterday';
  if (date >= startOfWeek) return 'thisWeek';
  return 'earlier';
}

/** Groups already newest-first notifications into contiguous date buckets. */
function groupByDate(items: Notification[]): Array<{ bucket: DateBucket; items: Notification[] }> {
  const now = new Date();
  const groups: Array<{ bucket: DateBucket; items: Notification[] }> = [];
  for (const item of items) {
    const bucket = dateBucketFor(new Date(item.createdAt), now);
    const last = groups.at(-1);
    if (last?.bucket === bucket) last.items.push(item);
    else groups.push({ bucket, items: [item] });
  }
  return groups;
}

function formatRelativeTime(value: string, locale: string): string {
  const date = new Date(value);
  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, 'second');
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, 'hour');
  const diffDay = Math.round(diffHour / 24);
  if (Math.abs(diffDay) < 7) return rtf.format(diffDay, 'day');

  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function NotificationsList() {
  const t = useTranslations('Notifications');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  useEffect(() => {
    if (!isSessionPending && !session?.user) router.push('/sign-in');
  }, [isSessionPending, router, session?.user]);

  const { data, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['notifications', 'list', showUnreadOnly] as const,
    enabled: !!session?.user,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const res = await api.notifications.$get({
        query: {
          page: String(pageParam),
          limit: '20',
          ...(showUnreadOnly ? { unreadOnly: 'true' as const } : {}),
        },
      });
      if (!res.ok) throw new Error('Failed to load notifications');
      return res.json();
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
  });

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await api.notifications[':id'].read.$patch({ param: { id: notificationId } });
      if (!res.ok) throw new Error('Failed to mark as read');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  if (isSessionPending || !session?.user)
    return <p className="text-muted-foreground">{t('loading')}</p>;
  if (isLoading) return <p className="text-muted-foreground">{t('loading')}</p>;
  if (isError) return <p className="text-destructive">{t('error')}</p>;

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const unreadCount = data?.pages[0]?.unreadCount ?? 0;
  const groups = groupByDate(items);

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
        {unreadCount > 0 && (
          <p className="text-xs text-muted-foreground">{t('unreadCount', { count: unreadCount })}</p>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <BellOff className="size-6" strokeWidth={2} />
          </span>
          <p className="max-w-sm text-sm text-muted-foreground">
            {showUnreadOnly ? t('noUnread') : t('empty')}
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          {groups.map((group) => (
            <div key={group.bucket} className="grid gap-3">
              <div className="flex items-center gap-3">
                <h2 className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(`group.${group.bucket}`)}
                </h2>
                <div className="h-px flex-1 bg-border" />
              </div>
              <ul className="grid gap-3">
                {group.items.map((notification) => {
                  const config = TYPE_CONFIG[notification.type];
                  const Icon = config.icon;
                  const unread = !notification.readAt;
                  return (
                    <li key={notification.id}>
                      <Card
                        className={cn(
                          'relative overflow-hidden py-0 transition-colors',
                          unread && 'bg-accent/40 ring-1 ring-brand-yellow/40',
                        )}
                      >
                        {unread && (
                          <span className={cn('absolute inset-y-0 left-0 w-1', config.accent)} aria-hidden />
                        )}
                        <CardContent className="flex gap-4 py-4 pl-6">
                          <span
                            className={cn(
                              'flex size-10 shrink-0 items-center justify-center rounded-full',
                              config.iconWrap,
                            )}
                            aria-label={t(config.labelKey)}
                            title={t(config.labelKey)}
                          >
                            <Icon className="size-5" strokeWidth={2.25} />
                          </span>
                          <div className="grid min-w-0 flex-1 gap-1">
                            <div className="flex items-start justify-between gap-3">
                              <p
                                className={cn(
                                  'text-sm',
                                  unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90',
                                )}
                              >
                                {notification.title}
                              </p>
                              {unread && (
                                <span
                                  className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-blue"
                                  aria-label={t('unread')}
                                />
                              )}
                            </div>
                            <p className="line-clamp-2 text-sm text-muted-foreground">{notification.body}</p>
                            <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                              <span className="text-xs text-muted-foreground">
                                {formatRelativeTime(notification.createdAt, locale)}
                              </span>
                              <div className="flex items-center gap-4">
                                {notification.link && (
                                  <a
                                    href={notification.link}
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:underline"
                                  >
                                    {t('viewDetails')}
                                    <ExternalLink className="size-3.5" strokeWidth={2.25} />
                                  </a>
                                )}
                                {unread && (
                                  <button
                                    type="button"
                                    disabled={markReadMutation.isPending}
                                    onClick={() => markReadMutation.mutate(notification.id)}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground disabled:opacity-50"
                                  >
                                    <Check className="size-3.5" strokeWidth={2.25} />
                                    {t('markRead')}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {hasNextPage && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? t('loading') : t('loadMore')}
        </Button>
      )}
    </div>
  );
}
