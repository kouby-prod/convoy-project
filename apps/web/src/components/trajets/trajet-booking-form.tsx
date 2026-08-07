'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { createApiClient } from '@carpool/api-client';
import { Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookingMessages } from '@/components/trajets/booking-messages';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

/**
 * Passenger-facing booking form, rendered by `TrajetDetail` for anyone
 * viewing a trajet who isn't its driver. Posts to the same
 * `POST /trajets/:id/book` the driver's booking-management UI reads from,
 * and lets the passenger cancel via `POST .../bookings/:bookingId/cancel`
 * while their booking is still `pending` or `confirmed`.
 *
 * `myBooking` only tracks the booking made in this page session — there is
 * no "my bookings" listing yet, so a passenger who navigates away and back
 * loses the ability to cancel from here until that history view exists.
 */
export function TrajetBookingForm({
  trajetId,
  seatsAvailable,
  cancelled,
}: {
  trajetId: string;
  seatsAvailable: number;
  cancelled: boolean;
}) {
  const t = useTranslations('Trajets');
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
    },
  });

  if (isSessionPending) return null;

  if (!session?.user) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          {t('booking.signInPrompt')}{' '}
          <Link href="/sign-in" className="font-semibold text-primary">
            {t('booking.signInLink')}
          </Link>
        </CardContent>
      </Card>
    );
  }

  // A cancelled trajet's own banner is shown by `TrajetDetail` — nothing
  // more to say here unless the passenger still has a booking to see the
  // (now `cancelled`) status of.
  if (!myBooking && cancelled) return null;

  // Checked after `myBooking`: booking your own last seat drives
  // `seatsAvailable` to 0 via the query invalidation below, and your own
  // booking state should win over the now-stale "full" state.
  if (!myBooking && seatsAvailable < 1) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">{t('booking.full')}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('booking.title')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {myBooking ? (
          <>
            <p className="text-sm text-green-700">{t('booking.success')}</p>
            <p className="text-sm text-muted-foreground">
              {t(`bookings.status.${myBooking.status}`)}
            </p>
            {myBooking.status === 'pending' || myBooking.status === 'confirmed' ? (
              <Button
                size="sm"
                variant="outline"
                className="w-fit"
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
          </>
        ) : (
          <>
            {cancelledNotice ? (
              <p className="text-sm text-muted-foreground">{t('booking.cancelledNotice')}</p>
            ) : null}
            <div className="flex items-center gap-3">
              <label htmlFor="bookingSeats" className="text-sm font-medium">
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
                className="w-24"
              />
            </div>
            <Button
              onClick={() => bookMutation.mutate()}
              disabled={bookMutation.isPending}
              className="w-fit"
            >
              {bookMutation.isPending ? t('booking.submitting') : t('booking.submit')}
            </Button>
            {bookMutation.isError ? (
              <p className="text-sm text-destructive">{t('booking.errors.generic')}</p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
