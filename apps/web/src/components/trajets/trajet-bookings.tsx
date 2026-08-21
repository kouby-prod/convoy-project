'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, AlertCircle, Banknote, CheckCircle2, Clock } from 'lucide-react';
import { createApiClient } from '@carpool/api-client';
import type { DriverBooking } from '@carpool/schemas';
import { env } from '@/lib/env';
import {
  COMMISSION_AMOUNT_CENTS,
  formatCad,
  isPastDue,
  payableCents,
  remainingDueLabel,
} from '@/lib/booking-money';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { LabelledField } from '@/components/ui/labelled-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BookingMessages } from '@/components/trajets/booking-messages';
import { BookingStatusBadge } from '@/components/trajets/booking-status-badge';
import { UnreadBadge } from '@/components/messages/unread-badge';
import { useMessageReadMap } from '@/hooks/use-message-read';
import { fetchConversations } from '@/lib/conversations';
import { isThreadUnread } from '@/lib/message-read';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

const BOOKING_ACTION_ORDER: Record<DriverBooking['status'], number> = {
  pending: 0,
  awaiting_payment: 1,
  confirmed: 2,
  rejected: 3,
  cancelled: 4,
  expired: 5,
};

function queueAmountCents(booking: DriverBooking): number {
  if (booking.paymentMethod !== 'card' || booking.status === 'confirmed') {
    return booking.fareCents;
  }
  return payableCents(booking.invoiceTotalCents, booking.paymentMethod, booking.fareCents);
}

function sortDriverBookings(items: DriverBooking[]) {
  return [...items].sort(
    (a, b) => BOOKING_ACTION_ORDER[a.status] - BOOKING_ACTION_ORDER[b.status],
  );
}

function passengerInitials(firstName: string | null, lastName: string | null, fallback: string) {
  const a = (firstName?.[0] ?? '').toUpperCase();
  const b = (lastName?.[0] ?? '').toUpperCase();
  return `${a}${b}` || fallback.slice(0, 1).toUpperCase();
}

/**
 * Inline rating form the driver uses to rate a passenger, mirroring
 * `ReviewForm` in mes-reservations-list.tsx but for the opposite direction —
 * `POST /reviews` derives `driver_to_passenger` from the caller being the
 * trajet's driver.
 */
function RatePassengerForm({ bookingId, onSubmitted }: { bookingId: string; onSubmitted: () => void }) {
  const t = useTranslations('Trajets');
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
        throw new Error(body?.error ?? t('bookings.review.error'));
      }
      return res.json();
    },
    onSuccess: () => {
      setError(null);
      onSubmitted();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : t('bookings.review.error'));
    },
  });

  const ratingId = `passenger-rating-${bookingId}`;
  const commentId = `passenger-comment-${bookingId}`;

  return (
    <div className="grid gap-3 rounded-lg bg-background p-4 shadow-sm ring-1 ring-foreground/5">
      <LabelledField label={t('bookings.review.ratingLabel')} htmlFor={ratingId}>
        <Select value={String(rating)} onValueChange={(value) => setRating(Number(value))}>
          <SelectTrigger id={ratingId} className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[5, 4, 3, 2, 1].map((value) => (
              <SelectItem key={value} value={String(value)}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </LabelledField>
      <LabelledField label={t('bookings.review.commentLabel')} htmlFor={commentId}>
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
        {mutation.isPending ? t('bookings.review.submitting') : t('bookings.review.submit')}
      </Button>
    </div>
  );
}

/**
 * Driver booking console — adaptive master-detail (Material list-detail,
 * Airbnb host inbox, Gmail). Compact queue on the left; one request to act
 * on in the right pane. On small screens the panes stack: list first, then
 * detail with Back. Messages live only in the selected case, not every row.
 */
export function TrajetBookings({
  trajetId,
  departureDateTime,
}: {
  trajetId: string;
  departureDateTime: string;
}) {
  const t = useTranslations('Trajets');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [openReviewId, setOpenReviewId] = useState<string | null>(null);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const hasDeparted = new Date(departureDateTime) < new Date();
  const { markRead, userId, readMap } = useMessageReadMap();
  const { data: inbox } = useQuery({
    queryKey: ['messages', 'inbox'],
    queryFn: fetchConversations,
    staleTime: 30_000,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['trajets', trajetId, 'bookings', page],
    queryFn: async () => {
      const res = await api.trajets[':id'].bookings.$get({
        param: { id: trajetId },
        query: { page: String(page) },
      });
      if (!res.ok) throw new Error('Failed to load bookings');
      return res.json();
    },
  });

  const items = useMemo(
    () => (data?.items ? sortDriverBookings(data.items) : []),
    [data?.items],
  );
  const selected = items.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (!items.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId && items.some((item) => item.id === selectedId)) return;
    const first = items[0];
    if (!first) return;
    setSelectedId(first.id);
  }, [items, selectedId]);

  const mutation = useMutation({
    mutationFn: async ({
      bookingId,
      status,
    }: {
      bookingId: string;
      status: 'confirmed' | 'rejected';
    }) => {
      const res = await api.trajets[':id'].bookings[':bookingId'].$patch({
        param: { id: trajetId, bookingId },
        json: { status },
      });
      if (!res.ok) throw new Error('Failed to update booking');
      return res.json();
    },
    onSuccess: () => {
      setConfirmingId(null);
      queryClient.invalidateQueries({ queryKey: ['trajets', trajetId, 'bookings'] });
      queryClient.invalidateQueries({ queryKey: ['trajets', trajetId] });
    },
  });

  function selectBooking(id: string) {
    setSelectedId(id);
    setConfirmingId(null);
    setMobileShowDetail(true);
    markRead(id);
  }

  return (
    <div className="grid min-h-[min(36rem,calc(100dvh-14rem))] overflow-hidden rounded-lg bg-card shadow-md ring-1 ring-foreground/5 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)] dark:ring-foreground/10">
      <section
        aria-labelledby="driver-queue-heading"
        className={cn(
          'min-h-0 flex-col bg-muted/40',
          mobileShowDetail ? 'hidden lg:flex' : 'flex',
        )}
      >
        <div className="px-4 py-3">
          <h2 id="driver-queue-heading" className="font-heading text-sm font-medium text-foreground">
            {t('bookings.queueLabel')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('bookings.subtitle')}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {isLoading ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">{t('bookings.loading')}</p>
          ) : isError ? (
            <p className="px-2 py-4 text-sm text-destructive">{t('bookings.error')}</p>
          ) : !items.length ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">{t('bookings.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {items.map((booking) => (
                <li key={booking.id}>
                  <QueueRow
                    booking={booking}
                    locale={locale}
                    selected={booking.id === selectedId}
                    unread={Boolean(
                      inbox?.find((thread) => thread.bookingId === booking.id && isThreadUnread(thread, userId, readMap)),
                    )}
                    onSelect={() => selectBooking(booking.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
        {data?.items.length ? (
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => {
                setPage((p) => Math.max(1, p - 1));
                setMobileShowDetail(false);
              }}
            >
              {t('pagination.previous')}
            </Button>
            <span className="text-xs text-muted-foreground">{t('pagination.page', { page })}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={!data.hasMore}
              onClick={() => {
                setPage((p) => p + 1);
                setMobileShowDetail(false);
              }}
            >
              {t('pagination.next')}
            </Button>
          </div>
        ) : null}
      </section>

      <section
        aria-labelledby="driver-case-heading"
        className={cn(
          'min-h-0 flex-col',
          mobileShowDetail ? 'flex' : 'hidden lg:flex',
        )}
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 mb-3 w-fit lg:hidden"
            onClick={() => setMobileShowDetail(false)}
          >
            <ArrowLeft className="size-4" strokeWidth={2.25} />
            {t('bookings.backToQueue')}
          </Button>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t('bookings.loading')}</p>
          ) : selected ? (
            <DriverBookingCard
              headingId="driver-case-heading"
              booking={selected}
              locale={locale}
              confirming={confirmingId === selected.id}
              pendingAction={mutation.isPending}
              hasDeparted={hasDeparted}
              reviewed={reviewedIds.has(selected.id)}
              reviewOpen={openReviewId === selected.id}
              onAccept={() => setConfirmingId(selected.id)}
              onConfirmAccept={() => mutation.mutate({ bookingId: selected.id, status: 'confirmed' })}
              onCancelConfirm={() => setConfirmingId(null)}
              onReject={() => mutation.mutate({ bookingId: selected.id, status: 'rejected' })}
              onOpenReview={() => setOpenReviewId(selected.id)}
              onReviewed={() => {
                setReviewedIds((prev) => new Set(prev).add(selected.id));
                setOpenReviewId(null);
              }}
            />
          ) : (
            <>
              <h2 id="driver-case-heading" className="sr-only">
                {t('bookings.title')}
              </h2>
              <p className="py-10 text-center text-sm text-muted-foreground">{t('bookings.selectPrompt')}</p>
            </>
          )}
          {mutation.isError ? (
            <p className="mt-3 text-sm text-destructive">{t('bookings.actionError')}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function QueueRow({
  booking,
  locale,
  selected,
  unread,
  onSelect,
}: {
  booking: DriverBooking;
  locale: string;
  selected: boolean;
  unread: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations('Trajets');
  const displayName =
    [booking.firstName, booking.lastName].filter(Boolean).join(' ') || t('bookings.passenger');
  const amount = formatCad(queueAmountCents(booking), locale);
  const remaining =
    booking.status === 'awaiting_payment' && booking.invoiceDueAt && !isPastDue(booking.invoiceDueAt)
      ? remainingDueLabel(booking.invoiceDueAt)
      : null;
  const overdue = booking.status === 'awaiting_payment' && isPastDue(booking.invoiceDueAt);

  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-200',
        selected
          ? 'bg-primary/15 shadow-sm ring-1 ring-primary/25'
          : 'hover:bg-background/80',
      )}
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
        aria-hidden
      >
        {passengerInitials(booking.firstName, booking.lastName, displayName)}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm text-foreground', unread ? 'font-semibold' : 'font-medium')}>
          {displayName}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {t('bookings.seatsCount', { count: booking.seats })}
          {' · '}
          {amount}
          {booking.paymentStatus === 'failed' ? (
            <>
              {' · '}
              <span className="text-destructive">{t('bookings.declinedShort')}</span>
            </>
          ) : remaining ? (
            <>
              {' · '}
              {remaining}
            </>
          ) : overdue ? (
            <>
              {' · '}
              <span className="text-destructive">{t('bookings.overdueShort')}</span>
            </>
          ) : null}
        </span>
      </span>
      {unread ? <UnreadBadge count={1} /> : null}
      <BookingStatusBadge status={booking.status} />
    </button>
  );
}

function DriverBookingCard({
  headingId,
  booking,
  locale,
  confirming,
  pendingAction,
  hasDeparted,
  reviewed,
  reviewOpen,
  onAccept,
  onConfirmAccept,
  onCancelConfirm,
  onReject,
  onOpenReview,
  onReviewed,
}: {
  headingId: string;
  booking: DriverBooking;
  locale: string;
  confirming: boolean;
  pendingAction: boolean;
  hasDeparted: boolean;
  reviewed: boolean;
  reviewOpen: boolean;
  onAccept: () => void;
  onConfirmAccept: () => void;
  onCancelConfirm: () => void;
  onReject: () => void;
  onOpenReview: () => void;
  onReviewed: () => void;
}) {
  const t = useTranslations('Trajets');
  const tRide = useTranslations('Trajet');
  const passengerPays = formatCad(
    payableCents(booking.invoiceTotalCents, booking.paymentMethod, booking.fareCents),
    locale,
  );
  const driverGets = formatCad(booking.fareCents, locale);
  const commission = formatCad(COMMISSION_AMOUNT_CENTS, locale);
  const methodLabel = tRide(`paymentMethods.${booking.paymentMethod}`);
  const offPlatform = booking.paymentMethod !== 'card';
  const payWindowExpired =
    booking.status === 'awaiting_payment' && isPastDue(booking.invoiceDueAt);
  const displayName =
    [booking.firstName, booking.lastName].filter(Boolean).join(' ') || t('bookings.passenger');

  return (
    <article className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground"
            aria-hidden
          >
            {passengerInitials(booking.firstName, booking.lastName, displayName)}
          </span>
          <div className="min-w-0">
            <h2 id={headingId} className="truncate font-heading text-base font-medium text-foreground">
              {displayName}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('bookings.seatsCount', { count: booking.seats })}
              {' · '}
              {methodLabel}
            </p>
          </div>
        </div>
        <BookingStatusBadge status={booking.status} />
      </div>

      {booking.status === 'pending' ? (
        <>
          <SettlementStrip passengerPays={passengerPays} youReceive={driverGets} />
          <p className="text-sm leading-relaxed text-muted-foreground">
            {offPlatform
              ? t('bookings.settleOffPlatform', { method: methodLabel })
              : t('bookings.settleCard')}
          </p>
          {confirming ? (
            <div className="grid gap-3 rounded-lg bg-primary/10 p-4 ring-1 ring-primary/20">
              <p className="text-sm font-medium text-foreground">
                {offPlatform
                  ? t('bookings.confirmOffPlatform', { commission, driver: driverGets })
                  : t('bookings.confirmCard', { passenger: passengerPays, driver: driverGets })}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  className="font-semibold sm:flex-1"
                  disabled={pendingAction}
                  onClick={onConfirmAccept}
                >
                  {t('bookings.confirmAccept')}
                </Button>
                <Button
                  variant="outline"
                  className="sm:flex-1"
                  disabled={pendingAction}
                  onClick={onCancelConfirm}
                >
                  {t('bookings.back')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="font-semibold sm:flex-1" disabled={pendingAction} onClick={onAccept}>
                {t('bookings.accept')}
              </Button>
              <Button variant="outline" className="sm:flex-1" disabled={pendingAction} onClick={onReject}>
                {t('bookings.reject')}
              </Button>
            </div>
          )}
        </>
      ) : null}

      {booking.status === 'awaiting_payment' ? (
        <>
          <SettlementStrip passengerPays={passengerPays} youReceive={driverGets} />
          {booking.paymentStatus === 'failed' ? (
            <StatusCallout tone="danger" icon={AlertCircle} copy={t('bookings.paymentFailed')} />
          ) : null}
          {booking.paymentStatus === 'processing' ? (
            <StatusCallout tone="held" icon={Clock} copy={t('bookings.paymentProcessing')} />
          ) : null}
          {booking.invoiceDueAt ? (
            <PayWindow dueAt={booking.invoiceDueAt} expired={payWindowExpired} />
          ) : null}
        </>
      ) : null}

      {booking.status === 'confirmed' ? <ConfirmedSettlement booking={booking} locale={locale} /> : null}

      <BookingMessages
        bookingId={booking.id}
        pickupHints={
          booking.status === 'pending' ||
          booking.status === 'awaiting_payment' ||
          booking.status === 'confirmed'
        }
      />

      {booking.status === 'confirmed' && hasDeparted ? (
        reviewed ? (
          <p className="text-sm text-muted-foreground">{t('bookings.review.success')}</p>
        ) : reviewOpen ? (
          <RatePassengerForm bookingId={booking.id} onSubmitted={onReviewed} />
        ) : (
          <Button size="sm" variant="outline" className="w-fit" onClick={onOpenReview}>
            {t('bookings.review.cta')}
          </Button>
        )
      ) : null}
    </article>
  );
}

function SettlementStrip({
  passengerPays,
  youReceive,
}: {
  passengerPays: string;
  youReceive: string;
}) {
  const t = useTranslations('Trajets');

  return (
    <div className="grid grid-cols-2 gap-2">
      <MoneyCell label={t('bookings.passengerPaysLabel')} amount={passengerPays} />
      <MoneyCell label={t('bookings.youReceiveLabel')} amount={youReceive} />
    </div>
  );
}

function MoneyCell({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="rounded-lg bg-background px-3 py-3 shadow-sm ring-1 ring-foreground/5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums tracking-tight text-foreground">
        {amount}
      </p>
    </div>
  );
}

function ConfirmedSettlement({ booking, locale }: { booking: DriverBooking; locale: string }) {
  const t = useTranslations('Trajets');
  const tRide = useTranslations('Trajet');
  const methodLabel = tRide(`paymentMethods.${booking.paymentMethod}`);
  const driverGets = formatCad(booking.fareCents, locale);

  if (booking.payout) {
    const amount = formatCad(booking.payout.amountCents, locale);
    const copy =
      booking.payout.status === 'held'
        ? t('bookings.payoutHeld')
        : booking.payout.status === 'due'
          ? t('bookings.payoutDue')
          : booking.payout.status === 'paid'
            ? t('bookings.payoutPaid')
            : booking.payout.status === 'frozen'
              ? t('bookings.payoutFrozen')
              : t('bookings.payoutCancelled');
    const tone =
      booking.payout.status === 'paid' || booking.payout.status === 'due'
        ? 'success'
        : booking.payout.status === 'cancelled'
          ? 'muted'
          : 'held';
    return (
      <StatusCallout
        tone={tone}
        icon={booking.payout.status === 'paid' || booking.payout.status === 'due' ? CheckCircle2 : Banknote}
        amount={amount}
        copy={copy}
      />
    );
  }

  if (booking.paymentMethod !== 'card' && booking.fareCents > 0) {
    return (
      <StatusCallout
        tone="muted"
        icon={Banknote}
        amount={driverGets}
        copy={t('bookings.collectYourself', { method: methodLabel })}
      />
    );
  }

  if (booking.paymentMethod === 'card' && booking.fareCents > 0) {
    return (
      <StatusCallout tone="held" icon={Banknote} amount={driverGets} copy={t('bookings.payoutHeld')} />
    );
  }

  return null;
}

function StatusCallout({
  tone,
  icon: Icon,
  amount,
  copy,
}: {
  tone: 'success' | 'held' | 'muted' | 'danger';
  icon: typeof Banknote;
  amount?: string;
  copy: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg px-3 py-3 ring-1',
        tone === 'success' && 'bg-success/10 ring-success/20',
        tone === 'held' && 'bg-primary/10 ring-primary/20',
        tone === 'muted' && 'bg-muted ring-foreground/5',
        tone === 'danger' && 'bg-destructive/10 ring-destructive/20',
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          tone === 'success' && 'text-success',
          tone === 'held' && 'text-foreground',
          tone === 'muted' && 'text-muted-foreground',
          tone === 'danger' && 'text-destructive',
        )}
        strokeWidth={2}
        aria-hidden
      />
      <div className="min-w-0">
        {amount ? (
          <p className="font-display text-lg font-semibold tabular-nums tracking-tight text-foreground">
            {amount}
          </p>
        ) : null}
        <p
          className={cn(
            'text-sm leading-relaxed',
            tone === 'danger' ? 'text-destructive' : amount ? 'text-muted-foreground' : 'font-medium text-foreground',
          )}
        >
          {copy}
        </p>
      </div>
    </div>
  );
}

function PayWindow({ dueAt, expired }: { dueAt: string; expired: boolean }) {
  const t = useTranslations('Trajets');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (expired) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [expired]);

  if (expired || isPastDue(dueAt)) {
    return (
      <StatusCallout tone="danger" icon={Clock} copy={t('bookings.payWindowOverdue')} />
    );
  }
  const remaining = remainingDueLabel(dueAt, now);
  if (!remaining) return null;
  return (
    <div className="grid gap-1 rounded-lg bg-primary/10 px-3 py-3 ring-1 ring-primary/20">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t('bookings.payWindowLabel')}
      </p>
      <p className="font-display text-2xl font-semibold tabular-nums tracking-tight text-foreground">
        {remaining}
      </p>
      <p className="text-sm text-foreground">{t('bookings.payWindow', { remaining })}</p>
    </div>
  );
}
