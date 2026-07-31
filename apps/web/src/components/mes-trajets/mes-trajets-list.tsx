'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { createApiClient } from '@carpool/api-client';
import { useRouter, Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

/** Driver's own trajets (`GET /me/trajets`) — the entry point to review and
 * act on booking requests via each trajet's detail page. */
export function MesTrajetsList() {
  const t = useTranslations('MesTrajets');
  const router = useRouter();
  const { data: session, isPending: isSessionPending } = authClient.useSession();

  useEffect(() => {
    if (!isSessionPending && !session?.user) router.push('/sign-in');
  }, [isSessionPending, router, session?.user]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['me', 'trajets'],
    enabled: !!session?.user,
    queryFn: async () => {
      const res = await api.me.trajets.$get();
      if (!res.ok) throw new Error('Failed to load trajets');
      return res.json();
    },
  });

  if (isSessionPending || !session?.user) return <p className="text-muted-foreground">{t('loading')}</p>;
  if (isLoading) return <p className="text-muted-foreground">{t('loading')}</p>;
  if (isError) return <p className="text-destructive">{t('error')}</p>;
  if (!data?.length) return <p className="text-muted-foreground">{t('empty')}</p>;

  return (
    <ul className="grid gap-4">
      {data.map((item) => (
        <li key={item.id}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link href={`/trajets/${item.id}`} className="hover:underline">
                  {item.departureCity} - {item.destinationCity}
                </Link>
                {item.cancelledAt ? (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                    {t('cancelledBadge')}
                  </span>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 px-6 pb-6 pt-0 text-sm text-muted-foreground">
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
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
