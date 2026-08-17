'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { createApiClient } from '@carpool/api-client';
import { useRouter, Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { Button, buttonVariants } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookingMessages } from '@/components/trajets/booking-messages';
import { cn } from '@/lib/utils';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

/**
 * Inline rating form for one booking, shown once its trip has departed (see
 * `canReview` below). `POST /reviews` enforces the actual rules (confirmed,
 * departed, not already reviewed) — this is just the happy-path UI for it.
 */
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

  return (
    <div className="grid gap-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <label htmlFor={`rating-${bookingId}`} className="text-sm font-medium text-foreground">
          {t('review.ratingLabel')}
        </label>
        <select
          id={`rating-${bookingId}`}
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
        placeholder={t('review.commentLabel')}
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
        {mutation.isPending ? t('review.submitting') : t('review.submit')}
      </Button>
    </div>
  );
}

/**
 * Passenger's own bookings (`GET /me/bookings`), with a cancel action for
 * `pending`/`confirmed` bookings. This is what makes cancellation usable
 * beyond the single page session `TrajetBookingForm` tracks.
 */
export function MesReservationsList() {
  const t = useTranslations('MesReservations');
  const tStatus = useTranslations('Trajets');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [page, setPage] = useState(1);
  const [openReviewId, setOpenReviewId] = useState<string | null>(null);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isSessionPending && !session?.user) router.push('/sign-in');
  }, [isSessionPending, router, session?.user]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['me', 'bookings', page],
    enabled: !!session?.user,
    queryFn: async () => {
      const res = await api.me.bookings.$get({ query: { page: String(page) } });
      if (!res.ok) throw new Error('Failed to load bookings');
      return res.json();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ trajetId, bookingId }: { trajetId: string; bookingId: string }) => {
      const res = await api.trajets[':id'].bookings[':bookingId'].cancel.$post({
        param: { id: trajetId, bookingId },
      });
      if (!res.ok) throw new Error('Failed to cancel booking');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me', 'bookings'] });
    },
  });

  if (isSessionPending || !session?.user) return <p className="text-muted-foreground">{t('loading')}</p>;
  if (isLoading) return <p className="text-muted-foreground">{t('loading')}</p>;
  if (isError) return <p className="text-destructive">{t('error')}</p>;
  if (!data?.items.length) return <p className="text-muted-foreground">{t('empty')}</p>;

  return (
    <div className="grid gap-4">
      <ul className="grid gap-4">
        {data.items.map((item) => (
          <li key={item.id}>
            <Card>
              <CardHeader>
                <CardTitle>
                  <Link href={`/trajet/${item.trajetId}`} className="hover:underline">
                    {item.trajet.departureCity} - {item.trajet.destinationCity}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 px-6 pb-6 pt-0 text-sm text-muted-foreground">
                <div>
                  <strong className="text-foreground">{t('departureAt')}:</strong>{' '}
                  {formatDateTime(item.trajet.departureDateTime)}
                </div>
                <div>
                  <strong className="text-foreground">{t('seats')}:</strong> {item.seats}
                </div>
                <div>
                  <strong className="text-foreground">{t('status')}:</strong>{' '}
                  {tStatus(`bookings.status.${item.status}`)}
                </div>
                {item.status === 'pending' || item.status === 'awaiting_payment' || item.status === 'confirmed' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-fit"
                    disabled={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate({ trajetId: item.trajetId, bookingId: item.id })}
                  >
                    {cancelMutation.isPending ? t('cancelling') : t('cancel')}
                  </Button>
                ) : null}
                {item.status === 'awaiting_payment' ? (
                  <Link href={`/paiement/${item.id}`} className={cn(buttonVariants({ size: 'sm' }), 'w-fit')}>
                    {t('pay')}
                  </Link>
                ) : null}
                {item.status === 'awaiting_payment' || item.status === 'confirmed' ? (
                  <Link
                    href={`/paiement/${item.id}`}
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-fit')}
                  >
                    {t('invoice')}
                  </Link>
                ) : null}
                {item.status === 'confirmed' && new Date(item.trajet.departureDateTime) < new Date() ? (
                  reviewedIds.has(item.id) ? (
                    <p className="text-sm text-muted-foreground">{t('review.success')}</p>
                  ) : openReviewId === item.id ? (
                    <ReviewForm
                      bookingId={item.id}
                      onSubmitted={() => {
                        setReviewedIds((prev) => new Set(prev).add(item.id));
                        setOpenReviewId(null);
                      }}
                    />
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-fit"
                      onClick={() => setOpenReviewId(item.id)}
                    >
                      {t('review.cta')}
                    </Button>
                  )
                ) : null}
                <BookingMessages bookingId={item.id} />
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {cancelMutation.isError ? <p className="text-sm text-destructive">{t('cancelError')}</p> : null}
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
    </div>
  );
}
