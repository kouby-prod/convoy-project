'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Banknote, Clock, FileText, Search } from 'lucide-react';
import { createApiClient } from '@carpool/api-client';
import type { BookingStatus, BookingWithTrajet } from '@carpool/schemas';
import { DueCountdown } from '@/components/paiement/due-countdown';
import { driverFareCents, formatCad, isPastDue, payableCents } from '@/lib/booking-money';
import { groupByDateKey } from '@/lib/trip-when';
import { useRouter, Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { Button, buttonVariants } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { LabelledField } from '@/components/ui/labelled-field';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { BookingStatusBadge } from '@/components/trajets/booking-status-badge';
import { RatingStarInput } from '@/components/trajet/rating-stars';
import { ItineraryRow } from '@/components/trajet/itinerary-row';
import { TripDayHeading } from '@/components/trajet/trip-when';
import { cn } from '@/lib/utils';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);
const PAGE_SIZE = 50;
const GROUP_HEADING =
  'border-b border-border bg-muted/70 px-4 py-2.5 text-sm font-semibold capitalize text-foreground sm:px-5';

type BookingFilter = 'action' | 'upcoming' | 'past';

const ACTION_STATUSES = new Set<BookingStatus>(['pending', 'awaiting_payment']);

function needsAction(item: BookingWithTrajet) {
  return ACTION_STATUSES.has(item.status);
}

function isUpcoming(item: BookingWithTrajet, now: number) {
  return item.status === 'confirmed' && new Date(item.trajet.departureDateTime).getTime() >= now;
}

function isPast(item: BookingWithTrajet, now: number) {
  if (needsAction(item)) return false;
  if (item.status === 'rejected' || item.status === 'cancelled' || item.status === 'expired') {
    return true;
  }
  return new Date(item.trajet.departureDateTime).getTime() < now;
}

function driverLabel(item: BookingWithTrajet) {
  const first = item.trajet.driverFirstName?.trim() ?? '';
  const last = item.trajet.driverLastName?.trim() ?? '';
  if (!first && !last) return null;
  return last ? `${first} ${last.charAt(0)}.` : first;
}

function driverInitials(item: BookingWithTrajet) {
  const a = (item.trajet.driverFirstName?.[0] ?? '').toUpperCase();
  const b = (item.trajet.driverLastName?.[0] ?? '').toUpperCase();
  return `${a}${b}` || '?';
}

function cancelBody(
  status: BookingStatus,
  t: ReturnType<typeof useTranslations<'MesReservations'>>,
) {
  if (status === 'awaiting_payment') return t('cancelConfirm.awaiting_payment');
  if (status === 'confirmed') return t('cancelConfirm.confirmed');
  return t('cancelConfirm.pending');
}

function ReviewForm({ bookingId, onSubmitted }: { bookingId: string; onSubmitted: () => void }) {
  const t = useTranslations('MesReservations');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.reviews.$post({
        json: { bookingId, rating, comment: comment.trim() || undefined },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? t('review.error'));
      }
      return res.json();
    },
    onSuccess: () => {
      setError(null);
      onSubmitted();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : t('review.error'));
    },
  });

  const commentId = `comment-${bookingId}`;

  return (
    <div className="grid gap-3 rounded-lg bg-muted/40 p-4 ring-1 ring-foreground/5">
      <div className="grid gap-1.5">
        <RatingStarInput
          value={rating}
          onChange={setRating}
          label={t('review.ratingLabel')}
          valueLabel={(value) => t('review.stars', { count: value })}
          disabled={mutation.isPending}
        />
      </div>
      <LabelledField label={t('review.commentLabel')} htmlFor={commentId}>
        <Textarea
          id={commentId}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={mutation.isPending}
        />
      </LabelledField>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button
        size="sm"
        className="w-fit font-semibold"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? t('review.submitting') : t('review.submit')}
      </Button>
    </div>
  );
}

/**
 * Passenger bookings (`GET /me/bookings`): work queue first, itinerary rows,
 * confirm-to-cancel, one Message entry, star reviews after departure.
 */
export function MesReservationsList() {
  const t = useTranslations('MesReservations');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [filter, setFilter] = useState<BookingFilter>('action');
  const pickedDefault = useRef(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [openReviewId, setOpenReviewId] = useState<string | null>(null);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isSessionPending && !session?.user) router.push('/sign-in');
  }, [isSessionPending, router, session?.user]);

  const query = useInfiniteQuery({
    queryKey: ['me', 'bookings'],
    enabled: !!session?.user,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const res = await api.me.bookings.$get({
        query: { page: String(pageParam), limit: String(PAGE_SIZE) },
      });
      if (!res.ok) throw new Error('Failed to load bookings');
      return res.json();
    },
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  const now = Date.now();
  const payingItems = items
    .filter((item) => item.status === 'awaiting_payment')
    .sort(
      (a, b) =>
        new Date(a.invoiceDueAt ?? a.trajet.departureDateTime).getTime() -
        new Date(b.invoiceDueAt ?? b.trajet.departureDateTime).getTime(),
    );
  const waitingItems = items
    .filter((item) => item.status === 'pending')
    .sort(
      (a, b) =>
        new Date(a.trajet.departureDateTime).getTime() - new Date(b.trajet.departureDateTime).getTime(),
    );
  const actionItems = [...payingItems, ...waitingItems];
  const upcomingItems = items
    .filter((item) => isUpcoming(item, now))
    .sort(
      (a, b) =>
        new Date(a.trajet.departureDateTime).getTime() - new Date(b.trajet.departureDateTime).getTime(),
    );
  const pastItems = items
    .filter((item) => isPast(item, now))
    .sort(
      (a, b) =>
        new Date(b.trajet.departureDateTime).getTime() - new Date(a.trajet.departureDateTime).getTime(),
    );
  const upcomingGrouped = groupByDateKey(upcomingItems, (item) => item.trajet.departureDateTime);
  const pastGrouped = groupByDateKey(pastItems, (item) => item.trajet.departureDateTime);

  useEffect(() => {
    if (pickedDefault.current || !query.data) return;
    pickedDefault.current = true;
    if (actionItems.length) setFilter('action');
    else if (upcomingItems.length) setFilter('upcoming');
    else setFilter('past');
  }, [query.data, actionItems.length, upcomingItems.length]);

  const cancelMutation = useMutation({
    mutationFn: async ({ trajetId, bookingId }: { trajetId: string; bookingId: string }) => {
      const res = await api.trajets[':id'].bookings[':bookingId'].cancel.$post({
        param: { id: trajetId, bookingId },
      });
      if (!res.ok) throw new Error('Failed to cancel booking');
      return res.json();
    },
    onSuccess: () => {
      setConfirmingId(null);
      void queryClient.invalidateQueries({ queryKey: ['me', 'bookings'] });
    },
  });

  const rowProps = (item: BookingWithTrajet) => ({
    item,
    confirming: confirmingId === item.id,
    cancelling: cancelMutation.isPending && confirmingId === item.id,
    cancelError: cancelMutation.isError && confirmingId === item.id ? t('cancelError') : null,
    reviewed: item.reviewedByPassenger || reviewedIds.has(item.id),
    reviewOpen: openReviewId === item.id,
    onConfirmCancel: () => setConfirmingId(item.id),
    onDismissCancel: () => setConfirmingId(null),
    onCancel: () => cancelMutation.mutate({ trajetId: item.trajetId, bookingId: item.id }),
    onOpenReview: () => setOpenReviewId(item.id),
    onReviewed: () => {
      setReviewedIds((prev) => new Set(prev).add(item.id));
      setOpenReviewId(null);
      void queryClient.invalidateQueries({ queryKey: ['me', 'bookings'] });
    },
  });

  if (isSessionPending || !session?.user) {
    return <ListSkeleton label={t('loading')} />;
  }

  return (
    <div className="grid gap-5">
      <SegmentedTabs
        label={t('filters.label')}
        value={filter}
        onChange={setFilter}
        tabs={[
          { id: 'action', label: t('filters.action'), count: actionItems.length },
          { id: 'upcoming', label: t('filters.upcoming'), count: upcomingItems.length },
          { id: 'past', label: t('filters.past'), count: pastItems.length },
        ]}
      />

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
        <EmptyState title={t('empty')} action={<SearchRidesCta label={t('emptyCta')} />} />
      ) : filter === 'action' && !actionItems.length ? (
        <EmptyState title={t('emptyFilter.action')} />
      ) : filter === 'upcoming' && !upcomingItems.length ? (
        <EmptyState title={t('emptyFilter.upcoming')} action={<SearchRidesCta label={t('emptyCta')} />} />
      ) : filter === 'past' && !pastItems.length ? (
        <EmptyState title={t('emptyFilter.past')} />
      ) : filter === 'action' ? (
        <>
          {payingItems.length > 0 ? (
            <BookingGroup heading={t('payGroup')}>
              {payingItems.map((item) => (
                <BookingRow key={item.id} {...rowProps(item)} />
              ))}
            </BookingGroup>
          ) : null}
          {waitingItems.length > 0 ? (
            <BookingGroup heading={t('pendingGroup')}>
              {waitingItems.map((item) => (
                <BookingRow key={item.id} {...rowProps(item)} />
              ))}
            </BookingGroup>
          ) : null}
        </>
      ) : (
        (filter === 'upcoming' ? upcomingGrouped : pastGrouped).map(([dayKey, bookings]) => (
          <BookingGroup
            key={dayKey}
            heading={<TripDayHeading iso={bookings[0]!.trajet.departureDateTime} className={GROUP_HEADING} />}
          >
            {bookings.map((item) => (
              <BookingRow key={item.id} {...rowProps(item)} />
            ))}
          </BookingGroup>
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
    </div>
  );
}

function BookingGroup({ heading, children }: { heading: ReactNode; children: ReactNode }) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      {typeof heading === 'string' ? <h2 className={GROUP_HEADING}>{heading}</h2> : heading}
      <CardContent className="divide-y divide-border p-0">{children}</CardContent>
    </Card>
  );
}

function BookingRow({
  item,
  confirming,
  cancelling,
  cancelError,
  reviewed,
  reviewOpen,
  onConfirmCancel,
  onDismissCancel,
  onCancel,
  onOpenReview,
  onReviewed,
}: {
  item: BookingWithTrajet;
  confirming: boolean;
  cancelling: boolean;
  cancelError: string | null;
  reviewed: boolean;
  reviewOpen: boolean;
  onConfirmCancel: () => void;
  onDismissCancel: () => void;
  onCancel: () => void;
  onOpenReview: () => void;
  onReviewed: () => void;
}) {
  const t = useTranslations('MesReservations');
  const tRide = useTranslations('Trajet');
  const locale = useLocale();
  const due = payableCents(item.invoiceTotalCents, item.paymentMethod, item.fareCents);
  const driverDue = driverFareCents(item.paymentMethod, item.fareCents);
  const name = driverLabel(item);
  const departed = new Date(item.trajet.departureDateTime) < new Date();
  const canCancel =
    item.status === 'pending' ||
    item.status === 'awaiting_payment' ||
    (item.status === 'confirmed' && !departed);
  const canReview = item.status === 'confirmed' && departed;
  const canMessage =
    item.status === 'awaiting_payment' || item.status === 'confirmed' || item.status === 'pending';
  const closed =
    item.status === 'rejected' || item.status === 'expired' || item.status === 'cancelled';
  const place = [item.trajet.departurePlace, item.trajet.arrivalPlace].filter(Boolean).join(' → ') || null;

  return (
    <article className="grid gap-4 px-4 py-4 sm:px-5">
      <ItineraryRow
        href={`/trajet/${item.trajetId}`}
        departureIso={item.trajet.departureDateTime}
        from={item.trajet.departureCity}
        to={item.trajet.destinationCity}
        place={place}
        padded={false}
        priceLabel={item.status === 'awaiting_payment' ? undefined : formatCad(item.fareCents, locale)}
        trailing={<BookingStatusBadge status={item.status} />}
        footer={
          name || item.seats > 1 ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-foreground">
              {name ? (
                <span className="inline-flex items-center gap-2">
                  <span
                    className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
                    aria-hidden
                  >
                    {driverInitials(item)}
                  </span>
                  {name}
                </span>
              ) : null}
              {item.seats > 1 ? (
                <span className="text-muted-foreground">{t('seatsCount', { count: item.seats })}</span>
              ) : null}
            </div>
          ) : null
        }
      />

      {item.status === 'pending' ? (
        <p className="text-sm text-muted-foreground">{t('waitingDriver')}</p>
      ) : null}

      {item.status === 'awaiting_payment' ? (
        <div className="grid gap-2 rounded-lg bg-primary/10 px-3 py-3 ring-1 ring-primary/20">
          <p className="font-display text-2xl font-semibold tabular-nums tracking-tight text-foreground">
            {formatCad(due, locale)}
          </p>
          {item.invoiceDueAt ? (
            isPastDue(item.invoiceDueAt) ? (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <Clock className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden />
                {t('dueOverdue')}
              </p>
            ) : (
              <DueCountdown dueAt={item.invoiceDueAt} emphasis="hero" />
            )
          ) : null}
          <Link
            href={`/paiement/${item.id}`}
            className={cn(buttonVariants({ size: 'default' }), 'mt-1 w-full font-semibold')}
          >
            {t('pay', { amount: formatCad(due, locale) })}
          </Link>
        </div>
      ) : null}

      {item.status === 'confirmed' && driverDue > 0 ? (
        <div className="flex items-start gap-3 rounded-lg bg-muted px-3 py-3 ring-1 ring-foreground/5">
          <Banknote className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />
          <div>
            <p className="font-display text-lg font-semibold tabular-nums tracking-tight text-foreground">
              {formatCad(driverDue, locale)}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('stillOweDriverHint', { method: tRide(`paymentMethods.${item.paymentMethod}`) })}
            </p>
          </div>
        </div>
      ) : null}

      {confirming ? (
        <div className="grid gap-3 rounded-lg bg-destructive/10 p-4 ring-1 ring-destructive/20">
          <p className="text-sm font-medium text-foreground">{cancelBody(item.status, t)}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="destructive" disabled={cancelling} onClick={onCancel} className="sm:flex-1">
              {cancelling ? t('cancelling') : t('cancelConfirm.submit')}
            </Button>
            <Button variant="outline" disabled={cancelling} onClick={onDismissCancel} className="sm:flex-1">
              {t('cancelConfirm.keep')}
            </Button>
          </div>
          {cancelError ? <p className="text-sm text-destructive">{cancelError}</p> : null}
        </div>
      ) : (
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
          {canReview && !reviewed && !reviewOpen ? (
            <Button size="sm" className="w-full font-semibold sm:w-fit" onClick={onOpenReview}>
              {t('review.cta')}
            </Button>
          ) : null}
          {closed ? (
            <Link
              href="/trajet"
              className={cn(buttonVariants({ size: 'sm' }), 'w-full justify-center font-semibold sm:w-fit')}
            >
              {t('findAnother')}
            </Link>
          ) : null}
          {canMessage ? (
            <Link
              href={`/messages/${item.id}`}
              className={cn(
                buttonVariants({
                  variant:
                    item.status === 'awaiting_payment' || (canReview && !reviewed)
                      ? 'outline'
                      : 'secondary',
                  size: 'sm',
                }),
                'w-full justify-center sm:w-fit',
              )}
            >
              {t('messages')}
            </Link>
          ) : null}
          {item.status === 'confirmed' ? (
            <Link
              href={`/paiement/${item.id}`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full justify-center sm:w-fit')}
            >
              {t('invoice')}
            </Link>
          ) : null}
          {canCancel ? (
            <Button size="sm" variant="ghost" className="w-full text-muted-foreground sm:w-fit" onClick={onConfirmCancel}>
              {t('cancel')}
            </Button>
          ) : null}
        </div>
      )}

      {canReview && reviewed ? (
        <p className="text-sm text-muted-foreground">{t('review.success')}</p>
      ) : null}
      {canReview && reviewOpen ? <ReviewForm bookingId={item.id} onSubmitted={onReviewed} /> : null}
    </article>
  );
}

function SearchRidesCta({ label }: { label: string }) {
  return (
    <Link href="/trajet" className={cn(buttonVariants({ variant: 'primary' }), 'font-semibold')}>
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
        {tone === 'error' ? (
          <FileText className="size-8 text-destructive" strokeWidth={1.75} aria-hidden />
        ) : (
          <Search className="size-8 text-muted-foreground" strokeWidth={1.75} aria-hidden />
        )}
        <p className={cn('text-sm font-medium', tone === 'error' ? 'text-destructive' : 'text-foreground')}>
          {title}
        </p>
        {body ? <p className="max-w-sm text-sm text-muted-foreground">{body}</p> : null}
        {action}
      </CardContent>
    </Card>
  );
}
