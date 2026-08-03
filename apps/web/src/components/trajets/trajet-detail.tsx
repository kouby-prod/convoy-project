'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { createApiClient } from '@carpool/api-client';
import { Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrajetBookings } from '@/components/trajets/trajet-bookings';
import { TrajetBookingForm } from '@/components/trajets/trajet-booking-form';
import { TrajetOwnerActions } from '@/components/trajets/trajet-owner-actions';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(value));
}

/** The driver's average rating, fetched separately so the review module stays decoupled from trajet. */
function DriverRating({ driverId }: { driverId: string }) {
  const t = useTranslations('Trajets');

  const { data } = useQuery({
    queryKey: ['drivers', driverId, 'rating'],
    queryFn: async () => {
      const res = await api.drivers[':driverId'].rating.$get({ param: { driverId } });
      if (!res.ok) throw new Error('Failed to load driver rating');
      return res.json();
    },
  });

  if (!data || data.reviewCount === 0 || data.averageRating === null) {
    return <span>{t('driverRating.none')}</span>;
  }

  return <span>{t('driverRating.summary', { rating: data.averageRating.toFixed(1), count: data.reviewCount })}</span>;
}

export function TrajetDetail({ id }: { id: string }) {
  const t = useTranslations('Trajets');
  const { data: session } = authClient.useSession();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['trajets', id],
    queryFn: async () => {
      const res = await api.trajets[':id'].$get({ param: { id } });
      if (!res.ok) throw new Error('Failed to load trajet');
      return res.json();
    },
  });

  if (isLoading) return <p className="text-muted-foreground">{t('loading')}</p>;
  if (isError || !data) return <p className="text-destructive">{t('error')}</p>;

  return (
    <div className="grid gap-6">
      <Link href="/trajets" className={cn(buttonVariants({ variant: 'outline' }), 'w-fit')}>
        {t('backToList')}
      </Link>

      {data.cancelledAt ? (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {t('cancelledBanner')}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            {data.departureCity} - {data.destinationCity}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm text-muted-foreground">
          <div>
            <strong className="text-foreground">{t('departureAt')}:</strong>{' '}
            {formatDateTime(data.departureDateTime)}
          </div>
          <div>
            <strong className="text-foreground">{t('driverRating.label')}:</strong>{' '}
            <DriverRating driverId={data.driverId} />
          </div>
          <div>
            <strong className="text-foreground">{t('seats')}:</strong>{' '}
            {data.seatsAvailable}/{data.seatsTotal}
          </div>
          <div>
            <strong className="text-foreground">{t('price')}:</strong>{' '}
            {new Intl.NumberFormat(undefined, {
              style: 'currency',
              currency: 'CAD',
              maximumFractionDigits: 2,
            }).format(data.pricePerSeat)}
          </div>
          {data.comfort ? (
            <div>
              <strong className="text-foreground">{t('comfort')}:</strong> {data.comfort}
            </div>
          ) : null}
          {data.baggageAllowance ? (
            <div>
              <strong className="text-foreground">{t('baggageAllowance')}:</strong>{' '}
              {data.baggageAllowance}
            </div>
          ) : null}
          {data.description ? (
            <div>
              <strong className="text-foreground">{t('description')}:</strong>{' '}
              {data.description}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {session?.user?.id === data.driverId ? (
        <>
          <TrajetOwnerActions trajet={data} />
          <TrajetBookings trajetId={id} departureDateTime={data.departureDateTime} />
        </>
      ) : (
        <TrajetBookingForm trajetId={id} seatsAvailable={data.seatsAvailable} cancelled={!!data.cancelledAt} />
      )}
    </div>
  );
}
