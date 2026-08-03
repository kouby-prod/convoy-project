'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { createApiClient } from '@carpool/api-client';
import { env } from '@/lib/env';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

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

  return (
    <div className="grid gap-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <label htmlFor={`passenger-rating-${bookingId}`} className="text-sm font-medium text-foreground">
          {t('bookings.review.ratingLabel')}
        </label>
        <select
          id={`passenger-rating-${bookingId}`}
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          {[5, 4, 3, 2, 1].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
      <Textarea
        placeholder={t('bookings.review.commentLabel')}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button
        size="sm"
        className="w-fit"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? t('bookings.review.submitting') : t('bookings.review.submit')}
      </Button>
    </div>
  );
}

/**
 * Driver-only booking requests for a trajet. Rendered by `TrajetDetail` when
 * the signed-in user is the trajet's driver — see apps/api's
 * `GET /trajets/:id/bookings` and `PATCH /trajets/:id/bookings/:bookingId`.
 */
export function TrajetBookings({
  trajetId,
  departureDateTime,
}: {
  trajetId: string;
  departureDateTime: string;
}) {
  const t = useTranslations('Trajets');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [openReviewId, setOpenReviewId] = useState<string | null>(null);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const hasDeparted = new Date(departureDateTime) < new Date();

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
            <div key={booking.id} className="grid gap-3 rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between gap-4">
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

              {booking.status === 'confirmed' && hasDeparted ? (
                reviewedIds.has(booking.id) ? (
                  <p className="text-sm text-muted-foreground">{t('bookings.review.success')}</p>
                ) : openReviewId === booking.id ? (
                  <RatePassengerForm
                    bookingId={booking.id}
                    onSubmitted={() => {
                      setReviewedIds((prev) => new Set(prev).add(booking.id));
                      setOpenReviewId(null);
                    }}
                  />
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-fit"
                    onClick={() => setOpenReviewId(booking.id)}
                  >
                    {t('bookings.review.cta')}
                  </Button>
                )
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
