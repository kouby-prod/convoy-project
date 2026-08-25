'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { Route } from 'lucide-react';
import { createApiClient } from '@carpool/api-client';
import { deriveDriverVerification, type OwnedTrajet } from '@carpool/schemas';
import { useRouter, Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { fetchMyDocuments, fetchMyEligibility } from '@/lib/documents';
import { groupByDateKey } from '@/lib/trip-when';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { SegmentedTabs, TabPanel } from '@/components/ui/segmented-tabs';
import { ItineraryRow } from '@/components/trajet/itinerary-row';
import { TripDayHeading } from '@/components/trajet/trip-when';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);
const PAGE_SIZE = 50;
const GROUP_HEADING =
  'border-b border-border bg-muted/70 px-4 py-2.5 text-sm font-semibold capitalize text-foreground sm:px-5';

type RideFilter = 'upcoming' | 'past' | 'cancelled';
const TABS_ID = 'mes-trajets';

function needsWork(item: OwnedTrajet) {
  return !item.cancelledAt && (item.pendingRequestCount > 0 || item.awaitingPaymentCount > 0);
}

function isUpcoming(item: OwnedTrajet, now: number) {
  return !item.cancelledAt && !needsWork(item) && new Date(item.departureDateTime).getTime() >= now;
}

function isPast(item: OwnedTrajet, now: number) {
  return !item.cancelledAt && !needsWork(item) && new Date(item.departureDateTime).getTime() < now;
}

function byDepartureAsc(a: OwnedTrajet, b: OwnedTrajet) {
  return new Date(a.departureDateTime).getTime() - new Date(b.departureDateTime).getTime();
}

function byDepartureDesc(a: OwnedTrajet, b: OwnedTrajet) {
  return new Date(b.departureDateTime).getTime() - new Date(a.departureDateTime).getTime();
}

function workRank(item: OwnedTrajet) {
  return item.pendingRequestCount > 0 ? 0 : 1;
}

/**
 * Driver's published rides (`GET /me/trajets`) — work first, then itinerary
 * rows grouped by day. Upcoming / Past / Cancelled.
 */
export function MesTrajetsList() {
  const t = useTranslations('MesTrajets');
  const router = useRouter();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [filter, setFilter] = useState<RideFilter>('upcoming');

  useEffect(() => {
    if (!isSessionPending && !session?.user) router.push('/auth/signin');
  }, [isSessionPending, router, session?.user]);

  const query = useInfiniteQuery({
    queryKey: ['me', 'trajets'],
    enabled: !!session?.user,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const res = await api.me.trajets.$get({
        query: { page: String(pageParam), limit: String(PAGE_SIZE) },
      });
      if (!res.ok) throw new Error('Failed to load trajets');
      return res.json();
    },
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  // Same query keys as the ride-creation checklist and `/mes-documents` —
  // used only to show a "pending verification" badge; a ride isn't gated on
  // this, just hidden from public search server-side until it's `approved`.
  const documentsQuery = useQuery({
    queryKey: ['my-documents'],
    queryFn: fetchMyDocuments,
    enabled: !!session?.user,
  });
  const eligibilityQuery = useQuery({
    queryKey: ['my-eligibility'],
    queryFn: fetchMyEligibility,
    enabled: !!session?.user,
  });
  const verification =
    documentsQuery.data && eligibilityQuery.data
      ? deriveDriverVerification(documentsQuery.data, {
          dateOfBirth: eligibilityQuery.data.dateOfBirth,
        })
      : null;
  const isPendingVerification = verification !== null && verification.status !== 'approved';

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  const now = Date.now();
  const action = items
    .filter(needsWork)
    .sort((a, b) => workRank(a) - workRank(b) || byDepartureAsc(a, b));
  const upcoming = items.filter((item) => isUpcoming(item, now)).sort(byDepartureAsc);
  const past = items.filter((item) => isPast(item, now)).sort(byDepartureDesc);
  const cancelled = items.filter((item) => Boolean(item.cancelledAt)).sort(byDepartureDesc);
  const upcomingGrouped = groupByDateKey(upcoming, (item) => item.departureDateTime);
  const pastGrouped = groupByDateKey(past, (item) => item.departureDateTime);
  const cancelledGrouped = groupByDateKey(cancelled, (item) => item.departureDateTime);
  const upcomingCount = action.length + upcoming.length;

  if (isSessionPending || !session?.user) {
    return <ListSkeleton label={t('loading')} />;
  }

  return (
    <div className="grid gap-5">
      <SegmentedTabs
        id={TABS_ID}
        label={t('filters.label')}
        value={filter}
        onChange={setFilter}
        tabs={[
          { id: 'upcoming', label: t('filters.upcoming'), count: upcomingCount },
          { id: 'past', label: t('filters.past'), count: past.length },
          { id: 'cancelled', label: t('filters.cancelled'), count: cancelled.length },
        ]}
      />

      <TabPanel tabsId={TABS_ID} tab={filter} className="grid gap-5">
      {query.isLoading ? (
        <ListSkeleton label={t('loading')} />
      ) : query.isError ? (
        <EmptyState
          title={t('error')}
          tone="error"
          action={
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
              {t('retry')}
            </Button>
          }
        />
      ) : !items.length ? (
        <EmptyState title={t('empty')} action={<PostRideCta label={t('post')} />} />
      ) : filter === 'upcoming' && !upcomingCount ? (
        <EmptyState title={t('emptyFilter.upcoming')} action={<PostRideCta label={t('post')} />} />
      ) : filter === 'past' && !past.length ? (
        <EmptyState title={t('emptyFilter.past')} />
      ) : filter === 'cancelled' && !cancelled.length ? (
        <EmptyState title={t('emptyFilter.cancelled')} />
      ) : filter === 'upcoming' ? (
        <>
          {action.length > 0 ? (
            <RideGroup heading={<h2 className={GROUP_HEADING}>{t('needsAction')}</h2>}>
              {action.map((item) => (
                <RideRow key={item.id} item={item} isPendingVerification={isPendingVerification} />
              ))}
            </RideGroup>
          ) : null}
          {upcomingGrouped.map(([dayKey, rides]) => (
            <RideGroup
              key={dayKey}
              heading={<TripDayHeading iso={rides[0]!.departureDateTime} className={GROUP_HEADING} />}
            >
              {rides.map((item) => (
                <RideRow key={item.id} item={item} isPendingVerification={isPendingVerification} />
              ))}
            </RideGroup>
          ))}
        </>
      ) : (
        (filter === 'past' ? pastGrouped : cancelledGrouped).map(([dayKey, rides]) => (
          <RideGroup
            key={dayKey}
            heading={<TripDayHeading iso={rides[0]!.departureDateTime} className={GROUP_HEADING} />}
          >
            {rides.map((item) => (
              <RideRow key={item.id} item={item} isPendingVerification={isPendingVerification} />
            ))}
          </RideGroup>
        ))
      )}

      {query.hasNextPage ? (
        <Button
          variant="outline"
          className="justify-self-center"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? t('loadingMore') : t('loadMore')}
        </Button>
      ) : null}
      </TabPanel>
    </div>
  );
}

function RideGroup({ heading, children }: { heading: ReactNode; children: ReactNode }) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      {heading}
      <CardContent className="divide-y divide-border p-0">{children}</CardContent>
    </Card>
  );
}

function RideRow({
  item,
  isPendingVerification,
}: {
  item: OwnedTrajet;
  isPendingVerification: boolean;
}) {
  const t = useTranslations('MesTrajets');
  const format = useFormatter();
  const taken = Math.max(0, item.seatsTotal - item.seatsAvailable);
  const place = [item.departurePlace, item.arrivalPlace].filter(Boolean).join(' → ') || null;

  return (
    <ItineraryRow
      href={`/trajet/${item.id}`}
      departureIso={item.departureDateTime}
      arrivalIso={item.arrivalDateTime}
      from={item.departureCity}
      to={item.destinationCity}
      place={place}
      priceLabel={format.number(item.pricePerSeat, { style: 'currency', currency: 'CAD' })}
      occupancy={{ taken, total: item.seatsTotal, label: t('occupancy', { taken, total: item.seatsTotal }) }}
      trailing={
        <>
          {item.cancelledAt ? <Badge variant="destructive">{t('cancelledBadge')}</Badge> : null}
          {!item.cancelledAt && isPendingVerification ? (
            <Badge variant="warning">{t('pendingVerificationBadge')}</Badge>
          ) : null}
          {!item.cancelledAt && item.pendingRequestCount > 0 ? (
            <Badge variant="warning">{t('pendingRequests', { count: item.pendingRequestCount })}</Badge>
          ) : null}
          {!item.cancelledAt && item.awaitingPaymentCount > 0 ? (
            <Badge variant="primary">{t('awaitingPayment', { count: item.awaitingPaymentCount })}</Badge>
          ) : null}
        </>
      }
    />
  );
}

function PostRideCta({ label }: { label: string }) {
  return (
    <Link href="/trajet/nouveau" className={cn(buttonVariants({ variant: 'primary' }), 'font-semibold')}>
      {label}
    </Link>
  );
}

function EmptyState({
  title,
  body,
  action,
  tone,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  tone?: 'error';
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 p-10 pt-10 text-center">
        <Route className="size-8 text-muted-foreground" strokeWidth={1.75} aria-hidden />
        <p
          role={tone === 'error' ? 'alert' : undefined}
          className={cn('text-sm font-medium', tone === 'error' ? 'text-destructive' : 'text-foreground')}
        >
          {title}
        </p>
        {body ? <p className="max-w-sm text-sm text-muted-foreground">{body}</p> : null}
        {action}
      </CardContent>
    </Card>
  );
}
