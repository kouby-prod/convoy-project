'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { CheckCircle2 } from 'lucide-react';
import { createApiClient } from '@carpool/api-client';
import { Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BookingMessages } from '@/components/trajets/booking-messages';
import { cn } from '@/lib/utils';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

/**
 * Quiet booking panel — price + seats + CTA. Intentionally secondary to the
 * itinerary (BlaBlaCar-style detail hierarchy).
 */
export function TrajetBookingForm({
  trajetId,
  seatsAvailable,
  cancelled,
  pricePerSeat,
  seatsTotal,
}: {
  trajetId: string;
  seatsAvailable: number;
  cancelled: boolean;
  pricePerSeat?: number;
  seatsTotal?: number;
}) {
  const t = useTranslations('Trajets');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [seats, setSeats] = useState(1);
  const [myBooking, setMyBooking] = useState<{ id: string; status: string } | null>(null);
  const [cancelledNotice, setCancelledNotice] = useState(false);

  const bookMutation = useMutation({
    mutationFn: async () => {
      const res = await api.trajets[':id'].book.$post({
        param: { id: trajetId },
        json: { seats },
      });
      if (!res.ok) throw new Error(t('booking.errors.generic'));
      return res.json();
    },
    onSuccess: (data) => {
      setMyBooking({ id: data.id, status: data.status });
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

  const estimatedTotal = typeof pricePerSeat === 'number' ? pricePerSeat * seats : null;

  return (
    <div className={shell}>
      {typeof pricePerSeat === 'number' && !myBooking ? (
        <PriceBlock
          pricePerSeat={pricePerSeat}
          seatsAvailable={seatsAvailable}
          seatsTotal={seatsTotal}
          format={format}
          t={t}
        />
      ) : (
        <p className="text-sm font-semibold text-foreground">{t('booking.title')}</p>
      )}

      {myBooking ? (
        <div className="mt-4 space-y-3">
          <div className="flex gap-2 rounded-md bg-success/10 px-3 py-2.5 ring-1 ring-success/20">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={2} />
            <div>
              <p className="text-sm font-medium text-foreground">{t('booking.success')}</p>
              <p className="text-xs text-muted-foreground">{t(`bookings.status.${myBooking.status}`)}</p>
            </div>
          </div>
          {myBooking.status === 'pending' || myBooking.status === 'confirmed' ? (
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
          {estimatedTotal !== null ? (
            <p className="text-xs text-muted-foreground">
              {t('booking.estimatedTotal', {
                amount: format.number(estimatedTotal, { style: 'currency', currency: 'CAD' }),
              })}
            </p>
          ) : null}
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
}: {
  pricePerSeat: number;
  seatsAvailable: number;
  seatsTotal?: number;
  format: ReturnType<typeof useFormatter>;
  // next-intl translator for Trajets namespace
  t: (key: string, values?: Record<string, string | number | Date>) => string;
}) {
  return (
    <div>
      <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
        {format.number(pricePerSeat, { style: 'currency', currency: 'CAD' })}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{t('perSeat')}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {typeof seatsTotal === 'number'
          ? t('seatsAvailable', { available: seatsAvailable, total: seatsTotal })
          : t('seatsLeft', { count: seatsAvailable })}
      </p>
    </div>
  );
}
