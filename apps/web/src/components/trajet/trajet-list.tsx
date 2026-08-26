'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { TrajetSearchQuerySchema, type TrajetListing, type TrajetSearchQuery } from '@carpool/schemas';
import { Link } from '@/i18n/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { isAmenity } from '@/components/trajet/trajet-amenities';
import { TrajetRow } from '@/components/trajet/trajet-row';
import { fetchTrajets, toDateKey } from '@/lib/trajets';
import { cn } from '@/lib/utils';

/* Right-hand result list on /trajet. Reads filters from the URL, then groups
   matching rides under a date header. */
export function TrajetList() {
  const t = useTranslations('Trajet');
  const format = useFormatter();
  const searchParams = useSearchParams();

  const query = parseSearchQuery(searchParams);
  const hasFilters = Boolean(
    query.from ||
      query.to ||
      query.date ||
      query.time ||
      query.seats ||
      query.maxPrice ||
      query.amenities.length ||
      (query.stopPolicy && query.stopPolicy !== 'any'),
  );

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['trajet', query],
    queryFn: () => fetchTrajets(query),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <ResultsToolbar label={t('loading')} />
        <StatusCard>{t('loading')}</StatusCard>
      </div>
    );
  }

  if (isError) {
    return <StatusCard tone="error">{t('error')}</StatusCard>;
  }

  if (!data?.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 pt-10 text-center">
          <p className="text-sm font-medium text-foreground">{t('empty')}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t('emptyHint')}</p>
          {hasFilters ? (
            <Link href="/trajet" className={cn(buttonVariants({ variant: 'outline', size: 'default' }), 'mt-1')}>
              {t('emptyClear')}
            </Link>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('flex flex-col gap-5', isFetching && 'opacity-80')}>
      <ResultsToolbar label={t('resultsCount', { count: data.length })} />

      {groupByDay(data).map(([dayKey, trajets]) => (
        <Card key={dayKey} className="overflow-hidden gap-0 py-0">
          <h2 className="border-b border-border bg-muted/70 px-5 py-2.5 text-sm font-semibold capitalize text-foreground">
            {format.dateTime(new Date(trajets[0]!.departureAt), {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </h2>

          <CardContent className="divide-y divide-border p-0">
            {trajets.map((trajet) => (
              <TrajetRow key={trajet.id} trajet={trajet} />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ResultsToolbar({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-0.5">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

function StatusCard({ children, tone }: { children: string; tone?: 'error' }) {
  return (
    <Card>
      <CardContent
        className={cn(
          'p-8 pt-8 text-center text-sm',
          tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {children}
      </CardContent>
    </Card>
  );
}

/** URL params → the shared search contract, tolerant of anything hand-typed. */
function parseSearchQuery(searchParams: URLSearchParams): TrajetSearchQuery {
  const parsed = TrajetSearchQuerySchema.safeParse({
    from: searchParams.get('from') ?? searchParams.get('departureCity') ?? undefined,
    to: searchParams.get('to') ?? searchParams.get('destinationCity') ?? undefined,
    date: searchParams.get('date') ?? undefined,
    time: searchParams.get('time') ?? undefined,
    seats: searchParams.get('seats') || undefined,
    maxPrice: searchParams.get('maxPrice') || undefined,
    amenities: searchParams.getAll('amenities').filter(isAmenity),
    stopPolicy: searchParams.get('stopPolicy') ?? undefined,
  });

  return parsed.success ? parsed.data : TrajetSearchQuerySchema.parse({});
}

/** Group results by calendar day, preserving the (already sorted) order. */
function groupByDay(trajets: TrajetListing[]): [string, TrajetListing[]][] {
  const byDay = new Map<string, TrajetListing[]>();

  for (const trajet of trajets) {
    const dayKey = toDateKey(new Date(trajet.departureAt));
    const bucket = byDay.get(dayKey);
    if (bucket) bucket.push(trajet);
    else byDay.set(dayKey, [trajet]);
  }

  return [...byDay.entries()];
}
