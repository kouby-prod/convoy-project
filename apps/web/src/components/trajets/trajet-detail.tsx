'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { createApiClient } from '@carpool/api-client';
import { Link } from '@/i18n/navigation';
import { env } from '@/lib/env';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function TrajetDetail({ id }: { id: string }) {
  const t = useTranslations('Trajets');

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
    </div>
  );
}
