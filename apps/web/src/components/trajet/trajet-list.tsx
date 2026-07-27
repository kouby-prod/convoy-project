'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { TrajetSearchQuerySchema, type Trajet, type TrajetSearchQuery } from '@carpool/schemas';
import { Card, CardContent } from '@/components/ui/card';
import { isAmenity } from '@/components/trajet/trajet-amenities';
import { TrajetRow } from '@/components/trajet/trajet-row';
import { fetchTrajets, toDateKey } from '@/lib/trajets';
import { cn } from '@/lib/utils';

/* The right-hand result list on /trajet. Reads its filters from the URL (the
   search rail writes them there), then groups the matching rides under a date
   header. */
export function TrajetList() {
  const t = useTranslations('Trajet');
  const format = useFormatter();
  const searchParams = useSearchParams();

  const query = parseSearchQuery(searchParams);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['trajet', query],
    queryFn: () => fetchTrajets(query),
  });

  if (isLoading) return <StatusCard>{t('loading')}</StatusCard>;
  if (isError) return <StatusCard tone="error">{t('error')}</StatusCard>;
  if (!data?.length) return <StatusCard>{t('empty')}</StatusCard>;

  return (
    <div className="flex flex-col gap-6">
      {groupByDay(data).map(([dayKey, trajets]) => (
        <Card key={dayKey} className="overflow-hidden">
          {/* Date band — the grey header above each day's rides. */}
          <h2 className="bg-muted px-6 py-3 text-center text-sm font-semibold text-muted-foreground">
            {format.dateTime(new Date(trajets[0]!.departureAt), {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </h2>

          <CardContent className="divide-y divide-border p-2 pt-2">
            {trajets.map((trajet) => (
              <TrajetRow key={trajet.id} trajet={trajet} />
            ))}
          </CardContent>
        </Card>
      ))}
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
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
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
function groupByDay(trajets: Trajet[]): [string, Trajet[]][] {
  const byDay = new Map<string, Trajet[]>();

  for (const trajet of trajets) {
    const dayKey = toDateKey(new Date(trajet.departureAt));
    const bucket = byDay.get(dayKey);
    if (bucket) bucket.push(trajet);
    else byDay.set(dayKey, [trajet]);
  }

  return [...byDay.entries()];
}
