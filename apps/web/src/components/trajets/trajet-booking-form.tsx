'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';
import { createApiClient } from '@carpool/api-client';
import type { RidePaymentMethod } from '@carpool/schemas';
import { Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { driverFareCents, formatCad, koubyDueCents, COMMISSION_AMOUNT_CENTS } from '@/lib/booking-money';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BookingMessages } from '@/components/trajets/booking-messages';
import { cn } from '@/lib/utils';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

/**
 * Quiet booking panel — price + seats + method cards + CTA. Intentionally
 * secondary to the itinerary (BlaBlaCar-style detail hierarchy).
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
  const queryClient = useQueryClient();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [seats, setSeats] = useState(1);
  const offered = paymentMethods.length > 0 ? paymentMethods : (['cash'] as RidePaymentMethod[]);
  const [paymentMethod, setPaymentMethod] = useState<RidePaymentMethod>(offered[0] ?? 'cash');
  const [myBooking, setMyBooking] = useState<{
    id: string;
    status: string;
    paymentMethod: RidePaymentMethod;
    seats: number;
  } | null>(null);
  const [cancelledNotice, setCancelledNotice] = useState(false);

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
      setMyBooking({
        id: data.id,
        status: data.status,
        paymentMethod: data.paymentMethod,
        seats: data.seats,
      });
      setCancelledNotice(false);
      queryClient.invalidateQueries({ queryKey: ['trajets', trajetId] });
      queryClient.invalidateQueries({ queryKey: ['trajet'] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!myBooking) throw new Error('No active booking to cancel');
      const res = await api.trajets[':id'].bookings[':bookingId'].cancel.$post({
        param: { id: trajetId, bookingId: myBooking.id },
      });
      if (!res.ok) throw new Error(t('booking.errors.cancelGeneric'));
      return res.json();
    },
    onSuccess: () => {
      setMyBooking(null);
      setCancelledNotice(true);
      queryClient.invalidateQueries({ queryKey: ['trajets', trajetId] });
      queryClient.invalidateQueries({ queryKey: ['trajet'] });
    },
  });

  const shell = 'rounded-md border border-border bg-card p-4 sm:p-5';

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

  if (!myBooking && cancelled) return null;

  if (!myBooking && seatsAvailable < 1) {
    return (
      <div className={shell}>
        <p className="text-sm font-medium text-foreground">{t('booking.title')}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t('booking.full')}</p>
      </div>
    );
  }

  const estimatedFare =
    typeof pricePerSeat === 'number'
      ? Math.round(pricePerSeat * 100) * (myBooking?.seats ?? seats)
      : null;
  const method = myBooking?.paymentMethod ?? paymentMethod;
  const koubyDue = estimatedFare !== null ? koubyDueCents(method, estimatedFare) : null;
  const driverDue = estimatedFare !== null ? driverFareCents(method, estimatedFare) : 0;

  return (
    <div className={shell}>
      {typeof pricePerSeat === 'number' && !myBooking ? (
        <PriceBlock
          pricePerSeat={pricePerSeat}
          seatsAvailable={seatsAvailable}
          seatsTotal={seatsTotal}
          format={format}
          t={t}
          tRide={tRide}
          locale={locale}
        />
      ) : (
        <p className="text-sm font-semibold text-foreground">{t('booking.title')}</p>
      )}

      {myBooking ? (
        <div className="mt-4 space-y-3">
          {myBooking.status === 'pending' ? (
            <div className="flex gap-2 rounded-md bg-muted px-3 py-2.5 ring-1 ring-foreground/5">
              <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />
              <div>
                <p className="text-sm font-medium text-foreground">{t('booking.pendingTitle')}</p>
                <p className="text-xs text-muted-foreground">
                  {driverDue > 0 && koubyDue !== null && estimatedFare !== null
                    ? t('booking.pendingBodyOffPlatform', {
                        commission: formatCad(koubyDue, locale),
                        fare: formatCad(estimatedFare, locale),
                      })
                    : t('booking.pendingBody', {
                        total: koubyDue !== null ? formatCad(koubyDue, locale) : '',
                      })}
                </p>
              </div>
            </div>
          ) : myBooking.status === 'awaiting_payment' ? (
            <div className="rounded-md bg-primary/10 px-3 py-2.5 ring-1 ring-primary/20">
              <p className="text-sm font-medium text-foreground">{t('booking.awaitingTitle')}</p>
              {koubyDue !== null ? (
                <p className="mt-1 text-xs text-muted-foreground">{formatCad(koubyDue, locale)}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t(`bookings.status.${myBooking.status}`)}</p>
          )}
          {myBooking.status === 'pending' || myBooking.status === 'awaiting_payment' || myBooking.status === 'confirmed' ? (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              {cancelMutation.isPending ? t('booking.cancelling') : t('booking.cancel')}
            </Button>
          ) : null}
          {myBooking.status === 'awaiting_payment' && koubyDue !== null ? (
            <Link
              href={`/paiement/${myBooking.id}`}
              className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'w-full font-semibold')}
            >
              {t('booking.pay', { amount: formatCad(koubyDue, locale) })}
            </Link>
          ) : null}
          {myBooking.status === 'confirmed' ? (
            <Link
              href={`/paiement/${myBooking.id}`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full')}
            >
              {t('booking.invoice')}
            </Link>
          ) : null}
          <Link
            href={`/messages/${myBooking.id}`}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-full')}
          >
            {t('booking.messages')}
          </Link>
          {cancelMutation.isError ? (
            <p className="text-sm text-destructive">{t('booking.errors.cancelGeneric')}</p>
          ) : null}
          <BookingMessages bookingId={myBooking.id} />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {cancelledNotice ? (
            <p className="text-sm text-muted-foreground">{t('booking.cancelledNotice')}</p>
          ) : null}
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
                setSeats(Number.isFinite(next) ? Math.min(Math.max(1, next), seatsAvailable) : 1);
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
                    'flex cursor-pointer flex-col gap-1 rounded-md border px-3 py-2.5',
                    selected ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border bg-background',
                  )}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    className="sr-only"
                    checked={selected}
                    onChange={() => setPaymentMethod(methodOption)}
                  />
                  <span className="text-sm font-medium text-foreground">
                    {t(`booking.methodCard.${methodOption}Title`)}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {t(`booking.methodCard.${methodOption}Pay`, { amount: payNow })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {methodOption === 'card'
                      ? t('booking.methodCard.cardBody')
                      : t(`booking.methodCard.${methodOption}Body`, { fare })}
                  </span>
                </label>
              );
            })}
          </fieldset>
          <Button
            onClick={() => bookMutation.mutate()}
            disabled={bookMutation.isPending}
            size="default"
            className="w-full font-semibold"
          >
            {bookMutation.isPending ? t('booking.submitting') : t('booking.submit')}
          </Button>
          {bookMutation.isError ? (
            <p className="text-sm text-destructive">{t('booking.errors.generic')}</p>
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
      <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
        {format.number(pricePerSeat, { style: 'currency', currency: 'CAD' })}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{t('perSeat')}</p>
      <p className="text-[11px] text-muted-foreground">
        {tRide('plusKoubyFee', { amount: formatCad(COMMISSION_AMOUNT_CENTS, locale) })}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {typeof seatsTotal === 'number'
          ? t('seatsAvailable', { available: seatsAvailable, total: seatsTotal })
          : t('seatsLeft', { count: seatsAvailable })}
      </p>
    </div>
  );
}
