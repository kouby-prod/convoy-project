'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, Banknote, Clock } from 'lucide-react';
import { createApiClient } from '@carpool/api-client';
import { DueCountdown } from '@/components/paiement/due-countdown';
import { driverFareCents, formatCad, isPastDue, payableCents } from '@/lib/booking-money';
import { useRouter, Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { Button, buttonVariants } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

  const ratingId = `rating-${bookingId}`;
  const commentId = `comment-${bookingId}`;

  return (
    <div className="grid gap-3 rounded-lg bg-muted/40 p-4 ring-1 ring-foreground/5">
      <LabelledField label={t('review.ratingLabel')} htmlFor={ratingId}>
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
 * Passenger's own bookings (`GET /me/bookings`), with a cancel action for
 * `pending`/`confirmed` bookings. This is what makes cancellation usable
 * beyond the single page session `TrajetBookingForm` tracks.
 */
export function MesReservationsList() {
  const t = useTranslations('MesReservations');
  const tRide = useTranslations('Trajet');
  const locale = useLocale();
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

  if (isSessionPending || !session?.user) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground">{t('loading')}</p>
        </CardContent>
      </Card>
    );
  }
  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground">{t('loading')}</p>
        </CardContent>
      </Card>
    );
  }
  if (isError) {
    return (
      <Card>
        <CardContent>
          <p className="text-destructive">{t('error')}</p>
        </CardContent>
      </Card>
    );
  }
  if (!data?.items.length) {
    return (
      <Card>
        <CardContent>
          <p className="py-4 text-muted-foreground">{t('empty')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <ul className="grid gap-4">
        {data.items.map((item) => (
          <li key={item.id}>
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="font-display text-lg">
                      <Link
                        href={`/trajet/${item.trajetId}`}
                        className="inline-flex min-w-0 flex-wrap items-center gap-x-2 hover:underline"
                      >
                        <span className="truncate">{item.trajet.departureCity}</span>
                        <ArrowRight className="size-4 shrink-0 text-brand-blue" strokeWidth={2.25} aria-hidden />
                        <span className="truncate">{item.trajet.destinationCity}</span>
                      </Link>
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDateTime(item.trajet.departureDateTime)}
                      {' · '}
                      {t('seats')}: {item.seats}
                      {' · '}
                      {tRide(`paymentMethods.${item.paymentMethod}`)}
                    </p>
                  </div>
                  <BookingStatusBadge status={item.status} />
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 px-6 pb-6 pt-0">
                {item.status === 'awaiting_payment' ? (
                  <div className="grid gap-2 rounded-lg bg-primary/10 px-3 py-3 ring-1 ring-primary/20">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('amountDue')}
                    </p>
                    <p className="font-display text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                      {formatCad(payableCents(item.invoiceTotalCents, item.paymentMethod, item.fareCents), locale)}
                    </p>
                    {item.invoiceDueAt ? (
                      isPastDue(item.invoiceDueAt) ? (
                        <p className="flex items-start gap-2 text-sm text-destructive">
                          <Clock className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden />
                          {t('dueOverdue')}
                        </p>
                      ) : (
                        <DueCountdown dueAt={item.invoiceDueAt} />
                      )
                    ) : null}
                    <Link
                      href={`/paiement/${item.id}`}
                      className={cn(buttonVariants({ size: 'default' }), 'mt-1 w-full font-semibold')}
                    >
                      {t('pay', {
                        amount: formatCad(
                          payableCents(item.invoiceTotalCents, item.paymentMethod, item.fareCents),
                          locale,
                        ),
                      })}
                    </Link>
                  </div>
                ) : null}
                {item.status === 'confirmed' && driverFareCents(item.paymentMethod, item.fareCents) > 0 ? (
                  <div className="flex items-start gap-3 rounded-lg bg-muted px-3 py-3 ring-1 ring-foreground/5">
                    <Banknote className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />
                    <div>
                      <p className="font-display text-lg font-semibold tabular-nums tracking-tight text-foreground">
                        {formatCad(driverFareCents(item.paymentMethod, item.fareCents), locale)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t('stillOweDriverHint', {
                          method: tRide(`paymentMethods.${item.paymentMethod}`),
                        })}
                      </p>
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
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
                {item.status === 'confirmed' ? (
                  <Link
                    href={`/paiement/${item.id}`}
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-fit')}
                  >
                    {t('invoice')}
                  </Link>
                ) : null}
                {item.status === 'awaiting_payment' || item.status === 'confirmed' || item.status === 'pending' ? (
                  <Link
                    href={`/messages/${item.id}`}
                    className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-fit')}
                  >
                    {t('messages')}
                  </Link>
                ) : null}
                </div>
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
