'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { createApiClient } from '@carpool/api-client';
import { env } from '@/lib/env';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

/**
 * Driver-only booking requests for a trajet. Rendered by `TrajetDetail` when
 * the signed-in user is the trajet's driver — see apps/api's
 * `GET /trajets/:id/bookings` and `PATCH /trajets/:id/bookings/:bookingId`.
 */
export function TrajetBookings({ trajetId }: { trajetId: string }) {
  const t = useTranslations('Trajets');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

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
      queryClient.invalidateQueries({ queryKey: ['trajets', trajetId, 'bookings'] });
      queryClient.invalidateQueries({ queryKey: ['trajets', trajetId] });
    },
  });

  if (isLoading) return <p className="text-muted-foreground">{t('bookings.loading')}</p>;
  if (isError) return <p className="text-destructive">{t('bookings.error')}</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('bookings.title')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!data?.items.length ? (
          <p className="text-sm text-muted-foreground">{t('bookings.empty')}</p>
        ) : (
          data.items.map((booking) => (
            <div
              key={booking.id}
              className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm"
            >
              <div>
                <div>
                  <strong className="text-foreground">{t('bookings.seats')}:</strong>{' '}
                  {booking.seats}
                </div>
                <div className="text-muted-foreground">
                  {t(`bookings.status.${booking.status}`)}
                </div>
              </div>

              {booking.status === 'pending' ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ bookingId: booking.id, status: 'confirmed' })}
                  >
                    {t('bookings.accept')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ bookingId: booking.id, status: 'rejected' })}
                  >
                    {t('bookings.reject')}
                  </Button>
                </div>
              ) : null}
            </div>
          ))
        )}
        {mutation.isError ? (
          <p className="text-sm text-destructive">{t('bookings.actionError')}</p>
        ) : null}
        {data?.items.length ? (
          <div className="flex items-center justify-between gap-4">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('pagination.previous')}
            </Button>
            <span className="text-xs text-muted-foreground">{t('pagination.page', { page })}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={!data.hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('pagination.next')}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
