'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import type { Conversation } from '@carpool/schemas';
import { useRouter, Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { fetchConversations, groupConversations, type ConversationGroup } from '@/lib/conversations';
import { unreadThreadCount } from '@/lib/message-read';
import { useMessageReadMap } from '@/hooks/use-message-read';
import { toDateKey } from '@/lib/trip-when';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { MessageThread } from '@/components/messages/message-thread';
import { UnreadBadge } from '@/components/messages/unread-badge';
import { ReportThreadPanel, ReportThreadTrigger } from '@/components/messages/report-thread';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const BOOKING_STATUSES = new Set(['pending', 'awaiting_payment', 'confirmed', 'rejected', 'cancelled', 'expired']);

type RoleFilter = 'all' | 'passenger' | 'driver';

/**
 * Split-pane inbox. Desktop: people list | thread. Mobile: list, or
 * full-bleed thread with back. Several bookings with the same person
 * share one row; the thread header switches trip.
 */
export function MessagesInbox({ selectedId }: { selectedId?: string }) {
  const t = useTranslations('Messages');
  const router = useRouter();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [filter, setFilter] = useState<RoleFilter>('all');
  const { userId, readMap, markRead } = useMessageReadMap();

  useEffect(() => {
    if (!isSessionPending && !session?.user) router.push('/sign-in');
  }, [isSessionPending, router, session?.user]);

  useEffect(() => {
    if (selectedId) markRead(selectedId);
  }, [selectedId, markRead]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['messages', 'inbox'],
    enabled: !!session?.user,
    queryFn: fetchConversations,
  });

  const filtered = useMemo(
    () => (data ?? []).filter((item) => (filter === 'all' ? true : item.role === filter)),
    [data, filter],
  );
  const groups = useMemo(() => groupConversations(filtered), [filtered]);
  const selected = data?.find((item) => item.bookingId === selectedId);
  const selectedGroup = useMemo(() => {
    if (!selectedId || !data) return undefined;
    return groupConversations(data).find((group) =>
      group.threads.some((thread) => thread.bookingId === selectedId),
    );
  }, [data, selectedId]);
  const passengerGroups = useMemo(
    () => groupConversations((data ?? []).filter((item) => item.role === 'passenger')),
    [data],
  );
  const driverGroups = useMemo(
    () => groupConversations((data ?? []).filter((item) => item.role === 'driver')),
    [data],
  );
  const allGroups = useMemo(() => groupConversations(data ?? []), [data]);

  if (isSessionPending || !session?.user) {
    return <ListSkeleton rows={6} label={t('loading')} className="m-4" />;
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-1 overflow-hidden bg-card sm:min-h-[min(36rem,calc(100dvh-8rem))] sm:rounded-lg sm:ring-1 sm:ring-foreground/10">
      <aside
        className={cn(
          'flex w-full flex-col border-border lg:w-96 lg:shrink-0 lg:border-r',
          selectedId ? 'hidden lg:flex' : 'flex',
        )}
      >
        <div className="grid gap-3 border-b border-border px-4 py-4">
          <h1 className="font-display text-xl font-semibold tracking-tight">{t('title')}</h1>
          <SegmentedTabs
            label={t('filterLabel')}
            value={filter}
            onChange={setFilter}
            tabs={[
              { id: 'all', label: t('filterAll'), count: allGroups.length },
              { id: 'passenger', label: t('filterPassenger'), count: passengerGroups.length },
              { id: 'driver', label: t('filterDriver'), count: driverGroups.length },
            ]}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? <ListSkeleton rows={6} label={t('loading')} className="rounded-none ring-0" /> : null}
          {isError ? (
            <div className="grid gap-2 p-4">
              <p className="text-sm text-destructive">{t('error')}</p>
              <Button size="sm" variant="outline" className="w-fit" onClick={() => void refetch()}>
                {t('retry')}
              </Button>
            </div>
          ) : null}
          {!isLoading && !isError && !groups.length ? (
            <div className="grid justify-items-center gap-3 px-6 py-12 text-center">
              <MessageSquare className="size-8 text-muted-foreground" strokeWidth={1.75} />
              <p className="text-sm font-medium text-foreground">{t('empty')}</p>
              <Link href="/trajet" className={cn(buttonVariants({ variant: 'primary' }), 'font-semibold')}>
                {t('emptyCta')}
              </Link>
            </div>
          ) : null}
          {groups.length ? (
            <ul>
              {groups.map((group) => (
                <InboxRow
                  key={group.key}
                  group={group}
                  selectedId={selectedId}
                  showRole={filter === 'all'}
                  unread={unreadThreadCount(group.threads, userId, readMap)}
                />
              ))}
            </ul>
          ) : null}
        </div>
      </aside>

      <section className={cn('min-h-0 min-w-0 flex-1 flex-col', selectedId ? 'flex' : 'hidden lg:flex')}>
        {selectedId ? (
          <ThreadPane conversation={selected} group={selectedGroup} bookingId={selectedId} />
        ) : (
          <div className="m-auto grid justify-items-center gap-2 px-6 text-center">
            <MessageSquare className="size-8 text-muted-foreground" strokeWidth={1.75} />
            <p className="text-sm text-muted-foreground">{t('selectThread')}</p>
          </div>
        )}
      </section>
    </div>
  );
}

function InboxRow({
  group,
  selectedId,
  showRole,
  unread,
}: {
  group: ConversationGroup;
  selectedId?: string;
  showRole: boolean;
  unread: number;
}) {
  const t = useTranslations('Messages');
  const tStatus = useTranslations('Trajets');
  const latest = group.threads[0];
  if (!latest) return null;
  const name = group.counterpart.name || t('counterpartUnknown');
  const selected = group.threads.some((thread) => thread.bookingId === selectedId);
  const openId = selected && selectedId ? selectedId : latest.bookingId;
  const statusLabel = BOOKING_STATUSES.has(latest.bookingStatus)
    ? tStatus(`bookings.status.${latest.bookingStatus as 'pending'}`)
    : latest.bookingStatus;
  const meta = [
    showRole ? t(`role.${group.role}`) : null,
    t('route', { from: latest.trip.departureCity, to: latest.trip.arrivalCity }),
    statusLabel,
    group.threads.length > 1 ? t('tripsCount', { count: group.threads.length }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li>
      <Link
        href={`/messages/${openId}`}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-all duration-200',
          'focus-visible:ring-3 focus-visible:ring-ring/30',
          selected ? 'bg-primary/15 ring-1 ring-inset ring-primary/25' : 'hover:bg-muted/60',
        )}
      >
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
          aria-hidden
        >
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={cn('truncate text-sm text-foreground', unread > 0 ? 'font-semibold' : 'font-medium')}>
              {name}
            </p>
            {latest.lastMessage ? (
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {shortWhen(latest.lastMessage.createdAt)}
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">{meta}</p>
          <p className={cn('truncate text-sm', unread > 0 ? 'font-medium text-foreground' : 'text-foreground/80')}>
            {latest.lastMessage?.body ?? t('threadEmpty')}
          </p>
        </div>
        <UnreadBadge count={unread} />
      </Link>
    </li>
  );
}

function ThreadPane({
  conversation,
  group,
  bookingId,
}: {
  conversation: Conversation | undefined;
  group: ConversationGroup | undefined;
  bookingId: string;
}) {
  const t = useTranslations('Messages');
  const tStatus = useTranslations('Trajets');
  const format = useFormatter();
  const router = useRouter();
  const [reportOpen, setReportOpen] = useState(false);
  const name = conversation?.counterpart.name || group?.counterpart.name || t('counterpartUnknown');
  const threads = group?.threads ?? (conversation ? [conversation] : []);
  const statusLabel =
    conversation && BOOKING_STATUSES.has(conversation.bookingStatus)
      ? tStatus(`bookings.status.${conversation.bookingStatus as 'pending'}`)
      : conversation?.bookingStatus;
  const routeLabel = conversation
    ? t('route', { from: conversation.trip.departureCity, to: conversation.trip.arrivalCity })
    : '';
  const pickupHints = conversation ? isLiveThread(conversation) : false;

  const { upcoming, past } = splitThreads(threads);
  const optionLabel = (thread: Conversation) =>
    t('tripOption', {
      date: format.dateTime(new Date(thread.trip.departureAt), { day: 'numeric', month: 'short' }),
      route: t('route', { from: thread.trip.departureCity, to: thread.trip.arrivalCity }),
      status: BOOKING_STATUSES.has(thread.bookingStatus)
        ? tStatus(`bookings.status.${thread.bookingStatus as 'pending'}`)
        : thread.bookingStatus,
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="grid shrink-0 gap-3 border-b border-border px-3 py-3 sm:px-4">
        <div className="flex items-center gap-3">
          <Link
            href="/messages"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0 lg:hidden')}
          >
            <ArrowLeft className="size-4" strokeWidth={2.25} />
            <span className="sr-only">{t('backToInbox')}</span>
          </Link>
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
            aria-hidden
          >
            {initials(name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">{name}</p>
            {conversation ? (
              <p className="truncate text-xs text-muted-foreground">
                {t('route', {
                  from: conversation.trip.departureCity,
                  to: conversation.trip.arrivalCity,
                })}
                {statusLabel ? ` · ${statusLabel}` : ''}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{t('contextMissing')}</p>
            )}
          </div>
          {conversation ? (
            <>
              <ReportThreadTrigger
                open={reportOpen}
                onClick={() => setReportOpen((value) => !value)}
              />
              <Link
                href={`/trajet/${conversation.trajetId}`}
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'sm' }),
                  'shrink-0',
                  threads.length > 1 && 'hidden sm:inline-flex',
                )}
              >
                {t('viewTrajet')}
              </Link>
            </>
          ) : null}
        </div>
        {reportOpen && conversation ? (
          <ReportThreadPanel
            bookingId={bookingId}
            counterpartName={name}
            route={routeLabel}
            onClose={() => setReportOpen(false)}
          />
        ) : null}
        {threads.length > 1 ? (
          <div className="flex items-center gap-2">
            <Select
              value={bookingId}
              onValueChange={(id) => {
                if (id !== bookingId) router.push(`/messages/${id}`);
              }}
            >
              <SelectTrigger aria-label={t('tripSwitcher')} className="h-10 min-w-0 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {upcoming.length ? (
                  <SelectGroup>
                    <SelectLabel>{t('tripGroupUpcoming')}</SelectLabel>
                    {upcoming.map((thread) => (
                      <SelectItem key={thread.bookingId} value={thread.bookingId}>
                        {optionLabel(thread)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
                {upcoming.length && past.length ? <SelectSeparator /> : null}
                {past.length ? (
                  <SelectGroup>
                    <SelectLabel>{t('tripGroupPast')}</SelectLabel>
                    {past.map((thread) => (
                      <SelectItem key={thread.bookingId} value={thread.bookingId}>
                        {optionLabel(thread)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
              </SelectContent>
            </Select>
            {conversation ? (
              <Link
                href={`/trajet/${conversation.trajetId}`}
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0 sm:hidden')}
              >
                {t('viewTrajet')}
              </Link>
            ) : null}
          </div>
        ) : null}
      </header>
      <MessageThread
        bookingId={bookingId}
        variant="pane"
        className="min-h-0 flex-1"
        pickupHints={pickupHints}
      />
    </div>
  );
}

const LIVE_STATUSES = new Set(['pending', 'awaiting_payment', 'confirmed']);

function isLiveThread(thread: Conversation) {
  return LIVE_STATUSES.has(thread.bookingStatus);
}

function isUpcomingThread(thread: Conversation, now = Date.now()) {
  if (!isLiveThread(thread)) return false;
  if (thread.bookingStatus === 'confirmed') {
    return Date.parse(thread.trip.departureAt) >= now;
  }
  return true;
}

function splitThreads(threads: Conversation[]) {
  const upcoming = threads
    .filter((thread) => isUpcomingThread(thread))
    .sort((a, b) => Date.parse(a.trip.departureAt) - Date.parse(b.trip.departureAt));
  const past = threads
    .filter((thread) => !isUpcomingThread(thread))
    .sort((a, b) => Date.parse(b.trip.departureAt) - Date.parse(a.trip.departureAt));
  return { upcoming, past };
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? '';
  return `${first}${second}`.toUpperCase() || '?';
}

function shortWhen(iso: string) {
  const date = new Date(iso);
  if (toDateKey(date) === toDateKey(new Date())) {
    return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}
