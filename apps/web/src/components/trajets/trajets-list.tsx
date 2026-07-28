'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { createApiClient } from '@carpool/api-client';
import { Link } from '@/i18n/navigation';
import { env } from '@/lib/env';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function TrajetsList() {
  const t = useTranslations('Trajets');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['trajets'],
    queryFn: async () => {
      const res = await api.trajets.$get();
      if (!res.ok) throw new Error('Failed to load trajets');
      return res.json();
    },
  });

  if (isLoading) return <p className="text-muted-foreground">{t('loading')}</p>;
  if (isError) return <p className="text-destructive">{t('error')}</p>;
  if (!data?.length) return <p className="text-muted-foreground">{t('empty')}</p>;

  return (
    <ul className="grid gap-4">
      {data.map((item) => (
        <li key={item.id}>
          <Card>
            <CardHeader>
              <CardTitle>
                <Link href={`/trajets/${item.id}`} className="hover:underline">
                  {item.departureCity} - {item.destinationCity}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 px-6 pb-6 pt-0 text-sm text-muted-foreground">
              <div>
                <strong className="text-foreground">{t('departureAt')}:</strong>{' '}
                {formatDateTime(item.departureDateTime)}
              </div>
              <div>
                <strong className="text-foreground">{t('seats')}:</strong>{' '}
                {item.seatsAvailable}/{item.seatsTotal}
              </div>
              <div>
                <strong className="text-foreground">{t('price')}:</strong>{' '}
                {new Intl.NumberFormat(undefined, {
                  style: 'currency',
                  currency: 'CAD',
                  maximumFractionDigits: 2,
                }).format(item.pricePerSeat)}
              </div>
              {item.description ? <div>{item.description}</div> : null}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
