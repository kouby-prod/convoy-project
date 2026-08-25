'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { createApiClient } from '@carpool/api-client';
import type { BookingStatus, RidePaymentMethod } from '@carpool/schemas';
import { Link, useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import {
  formatCad,
  koubyDueCents,
  koubyFeeCents,
  payableCents,
} from '@/lib/booking-money';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BookingStatusBadge } from '@/components/trajets/booking-status-badge';
import { DueCountdown } from '@/components/paiement/due-countdown';
import { cn } from '@/lib/utils';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

const ACTIVE_BOOKING = new Set<BookingStatus>(['pending', 'awaiting_payment', 'confirmed']);

type PanelBooking = {
  id: string;
  status: BookingStatus;
  paymentMethod: RidePaymentMethod;
  seats: number;
  invoiceTotalCents: number | null;
  invoiceDueAt: string | null;
};

/**
 * Quiet booking panel — price + seats + method cards + CTA. A confirmed
 * (or held) booking stays visible; leftover seats keep a second book path.
 */
export function TrajetBookingForm({
  trajetId,
  seatsAvailable,
  cancelled,
  pricePerSeat,
  seatsTotal,
  paymentMethods,
}: {
  trajetId: string;
  seatsAvailable: number;
  cancelled: boolean;
  pricePerSeat?: number;
  seatsTotal?: number;
  paymentMethods: RidePaymentMethod[];
}) {
  const t = useTranslations('Trajets');
  const tRide = useTranslations('Trajet');
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [seats, setSeats] = useState(1);
  const offered = paymentMethods.length > 0 ? paymentMethods : (['cash'] as RidePaymentMethod[]);
  const [paymentMethod, setPaymentMethod] = useState<RidePaymentMethod>(offered[0] ?? 'cash');
  const [optimistic, setOptimistic] = useState<PanelBooking | null>(null);
  const [cancelledNotice, setCancelledNotice] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    if (seatsAvailable >= 1 && seats > seatsAvailable) setSeats(seatsAvailable);
  }, [seats, seatsAvailable]);

  const bookMutation = useMutation({
    mutationFn: async () => {
      const res = await api.trajets[':id'].book.$post({
        param: { id: trajetId },
        json: { seats, paymentMethod },
      });
      if (!res.ok) throw new Error(t('booking.errors.generic'));
      return res.json();
    },
    onSuccess: (data) => {
      setOptimistic({
        id: data.id,
        status: data.status,
        paymentMethod: data.paymentMethod,
        seats: data.seats,
        invoiceTotalCents: null,
        invoiceDueAt: null,
      });
      setCancelledNotice(false);
      queryClient.invalidateQueries({ queryKey: ['trajets', trajetId] });
      queryClient.invalidateQueries({ queryKey: ['trajet'] });
      queryClient.invalidateQueries({ queryKey: ['me', 'bookings'] });
      if (data.status === 'awaiting_payment') {
        router.push(`/paiement/${data.id}`);
      }
    },
  });

  const { data: fetchedBookings = [] } = useQuery({
    queryKey: ['me', 'bookings', 'trajet', trajetId],
    enabled: Boolean(session?.user),
    queryFn: async () => {
      const res = await api.me.bookings.$get({ query: { page: '1', limit: '50' } });
      if (!res.ok) return [] as PanelBooking[];
      const body = await res.json();
      return body.items
        .filter((item) => item.trajetId === trajetId && ACTIVE_BOOKING.has(item.status))
        .map((item) => ({
          id: item.id,
          status: item.status,
          paymentMethod: item.paymentMethod,
          seats: item.seats,
          invoiceTotalCents: item.invoiceTotalCents,
          invoiceDueAt: item.invoiceDueAt,
        }));
    },
    refetchInterval: (query) =>
      query.state.data?.some((item) => item.status === 'pending') ? 8_000 : false,
  });

  const activeBookings = useMemo(() => {
    if (!optimistic) return fetchedBookings;
    if (fetchedBookings.some((item) => item.id === optimistic.id)) return fetchedBookings;
    return [...fetchedBookings, optimistic];
  }, [fetchedBookings, optimistic]);

  const cancelMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await api.trajets[':id'].bookings[':bookingId'].cancel.$post({
        param: { id: trajetId, bookingId },
      });
      if (!res.ok) throw new Error(t('booking.errors.cancelGeneric'));
      return res.json();
    },
    onSuccess: (_data, bookingId) => {
      setOptimistic((current) => (current?.id === bookingId ? null : current));
      setCancelledNotice(true);
      setConfirmingId(null);
      queryClient.invalidateQueries({ queryKey: ['trajets', trajetId] });
      queryClient.invalidateQueries({ queryKey: ['trajet'] });
      queryClient.invalidateQueries({ queryKey: ['me', 'bookings'] });
    },
  });

  const shell =
    'rounded-lg bg-card p-4 shadow-md ring-1 ring-foreground/5 sm:p-5 dark:ring-foreground/10';
  const canBookMore = !cancelled && seatsAvailable >= 1;

  if (isSessionPending) {
    return <div className={cn(shell, 'text-sm text-muted-foreground')}>{t('loading')}</div>;
  }

  if (!session?.user) {
    return (
      <div className={shell}>
        {typeof pricePerSeat === 'number' ? (
          <PriceBlock
            pricePerSeat={pricePerSeat}
            seatsAvailable={seatsAvailable}
            seatsTotal={seatsTotal}
            format={format}
            t={t}
            tRide={tRide}
            locale={locale}
          />
        ) : null}
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t('booking.signInPrompt')}</p>
        <Link
          href="/sign-in"
          className={cn(buttonVariants({ variant: 'primary', size: 'default' }), 'mt-4 w-full font-semibold')}
        >
          {t('booking.signInLink')}
        </Link>
      </div>
    );
  }

  if (!activeBookings.length && cancelled) return null;

  if (!activeBookings.length && !canBookMore) {
    return (
      <div className={shell}>
        <p className="text-sm font-medium text-foreground">{t('booking.title')}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t('booking.full')}</p>
      </div>
    );
  }

  return (
    <div className={cn(shell, 'grid gap-4')}>
      {activeBookings.map((booking) => {
        const fare =
          typeof pricePerSeat === 'number' ? Math.round(pricePerSeat * 100) * booking.seats : null;
        const due =
          fare !== null ? payableCents(booking.invoiceTotalCents, booking.paymentMethod, fare) : null;
        const payAmount =
          booking.status === 'awaiting_payment' && due !== null ? formatCad(due, locale) : null;
        return (
          <BookedPanel
            key={booking.id}
            booking={booking}
            payAmount={payAmount}
            confirmingCancel={confirmingId === booking.id}
            cancelling={cancelMutation.isPending && confirmingId === booking.id}
            cancelError={
              cancelMutation.isError && confirmingId === booking.id
                ? t('booking.errors.cancelGeneric')
                : null
            }
            onConfirmCancel={() => setConfirmingId(booking.id)}
            onDismissCancel={() => setConfirmingId(null)}
            onCancel={() => cancelMutation.mutate(booking.id)}
          />
        );
      })}

      {canBookMore ? (
        <div className={cn('grid gap-3', activeBookings.length && 'border-t border-border pt-4')}>
          {typeof pricePerSeat === 'number' ? (
            <PriceBlock
              pricePerSeat={pricePerSeat}
              seatsAvailable={seatsAvailable}
              seatsTotal={seatsTotal}
              format={format}
              t={t}
              tRide={tRide}
              locale={locale}
            />
          ) : null}
          {activeBookings.length ? (
            <p className="text-sm font-medium text-foreground">{t('booking.moreTitle')}</p>
          ) : null}
          {cancelledNotice && !activeBookings.length ? (
            <p className="text-sm text-muted-foreground">{t('booking.cancelledNotice')}</p>
          ) : null}
          <NewBookingFields
            seats={seats}
            seatsAvailable={seatsAvailable}
            paymentMethod={paymentMethod}
            offered={offered}
            pricePerSeat={pricePerSeat}
            locale={locale}
            pending={bookMutation.isPending}
            error={bookMutation.isError ? t('booking.errors.generic') : null}
            onSeats={setSeats}
            onMethod={setPaymentMethod}
            onSubmit={() => bookMutation.mutate()}
          />
        </div>
      ) : null}
    </div>
  );
}

function NewBookingFields({
  seats,
  seatsAvailable,
  paymentMethod,
  offered,
  pricePerSeat,
  locale,
  pending,
  error,
  onSeats,
  onMethod,
  onSubmit,
}: {
  seats: number;
  seatsAvailable: number;
  paymentMethod: RidePaymentMethod;
  offered: RidePaymentMethod[];
  pricePerSeat?: number;
  locale: string;
  pending: boolean;
  error: string | null;
  onSeats: (value: number) => void;
  onMethod: (value: RidePaymentMethod) => void;
  onSubmit: () => void;
}) {
  const t = useTranslations('Trajets');

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="bookingSeats" className="text-sm text-muted-foreground">
          {t('booking.seatsLabel')}
        </label>
        <Input
          id="bookingSeats"
          type="number"
          min={1}
          max={seatsAvailable}
          value={seats}
          onChange={(e) => {
            const next = Number(e.target.value);
            onSeats(Number.isFinite(next) ? Math.min(Math.max(1, next), seatsAvailable) : 1);
          }}
          className="h-9 w-20"
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm text-muted-foreground">{t('booking.methodLabel')}</legend>
        {offered.map((methodOption) => {
          const fareCents = typeof pricePerSeat === 'number' ? Math.round(pricePerSeat * 100) * seats : 0;
          const payNow = formatCad(koubyDueCents(methodOption, fareCents), locale);
          const fare = formatCad(fareCents, locale);
          const selected = paymentMethod === methodOption;
          return (
            <label
              key={methodOption}
              className={cn(
                'flex cursor-pointer flex-col gap-1 rounded-lg px-3 py-3 transition-all',
                selected
                  ? 'bg-primary/10 shadow-sm ring-2 ring-primary/40'
                  : 'bg-muted/50 ring-1 ring-foreground/5 hover:bg-muted',
              )}
            >
              <input
                type="radio"
                name="paymentMethod"
                className="sr-only"
                checked={selected}
                onChange={() => onMethod(methodOption)}
              />
              <span className="text-sm font-medium text-foreground">
                {t(`booking.methodCard.${methodOption}Title`)}
              </span>
              <span className="font-display text-lg font-semibold tabular-nums tracking-tight text-foreground">
                {t(`booking.methodCard.${methodOption}Pay`, { amount: payNow })}
              </span>
              <span className="text-sm text-muted-foreground">
                {methodOption === 'card'
                  ? t('booking.methodCard.cardBody')
                  : t(`booking.methodCard.${methodOption}Body`, { fare })}
              </span>
            </label>
          );
        })}
      </fieldset>
      <Button onClick={onSubmit} disabled={pending} size="default" className="w-full font-semibold">
        {pending ? t('booking.submitting') : t('booking.submit')}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function cancelCopy(
  status: BookingStatus,
  t: ReturnType<typeof useTranslations<'Trajets'>>,
) {
  if (status === 'awaiting_payment') return t('booking.cancelConfirm.awaiting_payment');
  if (status === 'confirmed') return t('booking.cancelConfirm.confirmed');
  return t('booking.cancelConfirm.pending');
}

function BookedPanel({
  booking,
  payAmount,
  confirmingCancel,
  cancelling,
  cancelError,
  onConfirmCancel,
  onDismissCancel,
  onCancel,
}: {
  booking: PanelBooking;
  payAmount: string | null;
  confirmingCancel: boolean;
  cancelling: boolean;
  cancelError: string | null;
  onConfirmCancel: () => void;
  onDismissCancel: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('Trajets');
  const canCancel =
    booking.status === 'pending' ||
    booking.status === 'awaiting_payment' ||
    booking.status === 'confirmed';

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <BookingStatusBadge status={booking.status} />
        <p className="text-sm text-muted-foreground">{t('booking.bookedSeats', { count: booking.seats })}</p>
      </div>

      {payAmount ? (
        <div className="grid gap-2 rounded-lg bg-primary/10 px-3 py-3 ring-1 ring-primary/20">
          <p className="font-display text-2xl font-semibold tabular-nums tracking-tight text-foreground">
            {payAmount}
          </p>
          {booking.invoiceDueAt ? <DueCountdown dueAt={booking.invoiceDueAt} emphasis="hero" /> : null}
          <Link
            href={`/paiement/${booking.id}`}
            className={cn(buttonVariants({ size: 'default' }), 'w-full font-semibold')}
          >
            {t('booking.pay', { amount: payAmount })}
          </Link>
        </div>
      ) : null}

      {confirmingCancel ? (
        <div className="grid gap-3 rounded-lg bg-destructive/10 p-4 ring-1 ring-destructive/20">
          <p className="text-sm font-medium text-foreground">{cancelCopy(booking.status, t)}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="destructive" disabled={cancelling} onClick={onCancel} className="sm:flex-1">
              {cancelling ? t('booking.cancelling') : t('booking.cancelConfirm.submit')}
            </Button>
            <Button variant="outline" disabled={cancelling} onClick={onDismissCancel} className="sm:flex-1">
              {t('booking.cancelConfirm.keep')}
            </Button>
          </div>
          {cancelError ? <p className="text-sm text-destructive">{cancelError}</p> : null}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/messages/${booking.id}`}
            className={cn(
              buttonVariants({
                variant: payAmount ? 'outline' : 'secondary',
                size: 'sm',
              }),
              'w-fit',
            )}
          >
            {t('booking.messages')}
          </Link>
          {booking.status === 'confirmed' ? (
            <Link
              href={`/paiement/${booking.id}`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-fit')}
            >
              {t('booking.invoice')}
            </Link>
          ) : null}
          {canCancel ? (
            <Button
              size="sm"
              variant="ghost"
              className="w-fit text-muted-foreground"
              onClick={onConfirmCancel}
            >
              {t('booking.cancel')}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PriceBlock({
  pricePerSeat,
  seatsAvailable,
  seatsTotal,
  format,
  t,
  tRide,
  locale,
}: {
  pricePerSeat: number;
  seatsAvailable: number;
  seatsTotal?: number;
  format: ReturnType<typeof useFormatter>;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  tRide: (key: string, values?: Record<string, string | number | Date>) => string;
  locale: string;
}) {
  return (
    <div>
      <p className="font-display text-2xl font-semibold tabular-nums tracking-tight text-foreground">
        {format.number(pricePerSeat, { style: 'currency', currency: 'CAD' })}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{t('perSeat')}</p>
      <p className="text-[11px] text-muted-foreground">
        {tRide('plusKoubyFee', { amount: formatCad(koubyFeeCents(), locale) })}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {typeof seatsTotal === 'number'
          ? t('seatsAvailable', { available: seatsAvailable, total: seatsTotal })
          : t('seatsLeft', { count: seatsAvailable })}
      </p>
    </div>
  );
}
