'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { createApiClient } from '@carpool/api-client';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { signInHref } from '@/lib/auth-urls';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SegmentedTabs, TabPanel } from '@/components/ui/segmented-tabs';
import { cn } from '@/lib/utils';
import {
  Check,
  CheckCheck,
  ChevronRight,
  BellOff,
  AlertCircle,
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

function NotificationsSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg bg-card shadow-sm ring-1 ring-foreground/5">
      <ul className="divide-y divide-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="flex items-center gap-4 px-5 py-4">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3.5 w-4/5" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NotificationsList() {
  const t = useTranslations('Notifications');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const showUnreadOnly = filter === 'unread';

  useEffect(() => {
    if (!isSessionPending && !session?.user) router.push(signInHref('/notifications'));
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

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const res = await api.notifications['read-all'].$patch();
      if (!res.ok) throw new Error('Failed to mark all as read');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  if (isSessionPending || (isLoading && !isError)) return <NotificationsSkeleton />;
  if (isError)
    return (
      <div role="alert" className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertCircle className="size-4 shrink-0" strokeWidth={2.25} aria-hidden />
        {t('error')}
      </div>
    );

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const unreadCount = data?.pages[0]?.unreadCount ?? 0;
  const groups = groupByDate(items);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          id="notifications"
          size="compact"
          label={t('filterLabel')}
          value={filter}
          onChange={setFilter}
          tabs={[
            { id: 'all', label: t('tabAll') },
            { id: 'unread', label: t('tabUnread'), count: unreadCount > 0 ? unreadCount : undefined },
          ]}
        />

        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            disabled={markAllReadMutation.isPending}
            onClick={() => markAllReadMutation.mutate()}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <CheckCheck className="size-4" strokeWidth={2.25} />
            {markAllReadMutation.isPending ? t('markingAll') : t('markAllRead')}
          </Button>
        )}
      </div>

      <TabPanel tabsId="notifications" tab={filter} className="grid gap-4">
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
              <div className="overflow-hidden rounded-lg bg-card shadow-sm ring-1 ring-foreground/5">
                <ul className="divide-y divide-border">
                  {group.items.map((notification) => {
                    const config = TYPE_CONFIG[notification.type];
                    const Icon = config.icon;
                    const unread = !notification.readAt;
                    const rowContent = (
                      <>
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
                        <div className="grid min-w-0 flex-1 gap-0.5">
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
                          <span className="mt-0.5 text-xs text-muted-foreground">
                            {formatRelativeTime(notification.createdAt, locale)}
                          </span>
                        </div>
                      </>
                    );

                    return (
                      <li key={notification.id} className="group relative">
                        {unread && (
                          <span
                            className={cn('absolute inset-y-0 left-0 w-1', config.accent)}
                            aria-hidden
                          />
                        )}
                        <div
                          className={cn(
                            'flex items-center gap-4 py-4 pl-6 pr-4 transition-colors',
                            unread && 'bg-accent/30',
                          )}
                        >
                          {notification.link ? (
                            <a
                              href={notification.link}
                              onClick={() => unread && markReadMutation.mutate(notification.id)}
                              className="flex min-w-0 flex-1 items-center gap-4 outline-none"
                            >
                              {rowContent}
                            </a>
                          ) : (
                            <div className="flex min-w-0 flex-1 items-center gap-4">{rowContent}</div>
                          )}
                          <div className="flex shrink-0 items-center gap-1">
                            {unread && (
                              <button
                                type="button"
                                disabled={markReadMutation.isPending}
                                onClick={() => markReadMutation.mutate(notification.id)}
                                title={t('markRead')}
                                aria-label={t('markRead')}
                                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                              >
                                <Check className="size-4" strokeWidth={2.25} />
                              </button>
                            )}
                            {notification.link && (
                              <ChevronRight
                                className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                                strokeWidth={2.25}
                                aria-hidden
                              />
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
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
      </TabPanel>
    </div>
  );
}
