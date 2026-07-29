'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { createApiClient } from '@carpool/api-client';
import { useRouter, Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
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

  useEffect(() => {
    if (!isSessionPending && !session?.user) router.push('/sign-in');
  }, [isSessionPending, router, session?.user]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['me', 'bookings'],
    enabled: !!session?.user,
    queryFn: async () => {
      const res = await api.me.bookings.$get();
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
  if (!data?.length) return <p className="text-muted-foreground">{t('empty')}</p>;

  return (
    <div className="grid gap-4">
      <ul className="grid gap-4">
        {data.map((item) => (
          <li key={item.id}>
            <Card>
              <CardHeader>
                <CardTitle>
                  <Link href={`/trajets/${item.trajetId}`} className="hover:underline">
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
                {item.status === 'pending' || item.status === 'confirmed' ? (
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
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {cancelMutation.isError ? <p className="text-sm text-destructive">{t('cancelError')}</p> : null}
    </div>
  );
}
