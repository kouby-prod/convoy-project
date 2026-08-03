'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { createApiClient } from '@carpool/api-client';
import { useRouter, Link } from '@/i18n/navigation';
import { env } from '@/lib/env';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

const COMFORT_ANY = 'all';

const DRIVER_RATING_ANY = 'all';

interface Filters {
  departureCity: string;
  destinationCity: string;
  date: string;
  comfort: string;
  maxPrice: string;
  minSeats: string;
  baggageAllowance: string;
  minDriverRating: string;
}

const EMPTY_FILTERS: Filters = {
  departureCity: '',
  destinationCity: '',
  date: '',
  comfort: COMFORT_ANY,
  maxPrice: '',
  minSeats: '',
  baggageAllowance: '',
  minDriverRating: DRIVER_RATING_ANY,
};

function filtersFromSearchParams(searchParams: URLSearchParams): Filters {
  return {
    departureCity: searchParams.get('departureCity') ?? '',
    destinationCity: searchParams.get('destinationCity') ?? '',
    date: searchParams.get('date') ?? '',
    comfort: searchParams.get('comfort') ?? COMFORT_ANY,
    maxPrice: searchParams.get('maxPrice') ?? '',
    minSeats: searchParams.get('minSeats') ?? '',
    baggageAllowance: searchParams.get('baggageAllowance') ?? '',
    minDriverRating: searchParams.get('minDriverRating') ?? DRIVER_RATING_ANY,
  };
}

/** Drop empty/sentinel values so the API only sees filters the user actually set. */
function toQuery(filters: Filters): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.departureCity) query.departureCity = filters.departureCity;
  if (filters.destinationCity) query.destinationCity = filters.destinationCity;
  if (filters.date) query.date = filters.date;
  if (filters.comfort !== COMFORT_ANY) query.comfort = filters.comfort;
  if (filters.maxPrice) query.maxPrice = filters.maxPrice;
  if (filters.minSeats) query.minSeats = filters.minSeats;
  if (filters.baggageAllowance) query.baggageAllowance = filters.baggageAllowance;
  if (filters.minDriverRating !== DRIVER_RATING_ANY) query.minDriverRating = filters.minDriverRating;
  return query;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function TrajetsList() {
  const t = useTranslations('Trajets');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => filtersFromSearchParams(searchParams));
  const [page, setPage] = useState(1);

  const query = useMemo(() => toQuery(filters), [filters]);

  // A filter change makes the previous page number meaningless.
  useEffect(() => setPage(1), [query]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['trajets', query, page],
    queryFn: async () => {
      const res = await api.trajets.$get({ query: { ...query, page: String(page) } });
      if (!res.ok) throw new Error('Failed to load trajets');
      return res.json();
    },
  });

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(toQuery(filters));
    router.push(`/trajets${params.toString() ? `?${params.toString()}` : ''}`);
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    router.push('/trajets');
  }

  return (
    <div className="grid gap-6">
      <form onSubmit={applyFilters} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder={t('filters.departureCity')}
          value={filters.departureCity}
          onChange={(e) => updateFilter('departureCity', e.target.value)}
        />
        <Input
          placeholder={t('filters.destinationCity')}
          value={filters.destinationCity}
          onChange={(e) => updateFilter('destinationCity', e.target.value)}
        />
        <Input
          type="date"
          aria-label={t('filters.date')}
          value={filters.date}
          onChange={(e) => updateFilter('date', e.target.value)}
        />
        <Select value={filters.comfort} onValueChange={(value) => updateFilter('comfort', value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={COMFORT_ANY}>{t('filters.comfortAny')}</SelectItem>
            <SelectItem value="standard">{t('filters.comfortStandard')}</SelectItem>
            <SelectItem value="confort">{t('filters.comfortConfort')}</SelectItem>
            <SelectItem value="premium">{t('filters.comfortPremium')}</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="number"
          min="0"
          placeholder={t('filters.maxPrice')}
          value={filters.maxPrice}
          onChange={(e) => updateFilter('maxPrice', e.target.value)}
        />
        <Input
          type="number"
          min="1"
          placeholder={t('filters.minSeats')}
          value={filters.minSeats}
          onChange={(e) => updateFilter('minSeats', e.target.value)}
        />
        <Input
          placeholder={t('filters.baggageAllowance')}
          value={filters.baggageAllowance}
          onChange={(e) => updateFilter('baggageAllowance', e.target.value)}
        />
        <Select
          value={filters.minDriverRating}
          onValueChange={(value) => updateFilter('minDriverRating', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DRIVER_RATING_ANY}>{t('filters.minDriverRatingAny')}</SelectItem>
            {[4, 3, 2, 1].map((value) => (
              <SelectItem key={value} value={String(value)}>
                {t('filters.minDriverRatingValue', { value })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">
            {t('filters.apply')}
          </Button>
          <Button type="button" variant="outline" onClick={resetFilters}>
            {t('filters.reset')}
          </Button>
        </div>
      </form>

      {isLoading ? <p className="text-muted-foreground">{t('loading')}</p> : null}
      {isError ? <p className="text-destructive">{t('error')}</p> : null}
      {!isLoading && !isError && !data?.items.length ? (
        <p className="text-muted-foreground">{t('empty')}</p>
      ) : null}

      {data?.items.length ? (
        <>
          <ul className="grid gap-4">
            {data.items.map((item) => (
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
                      <strong className="text-foreground">{t('driverRating.label')}:</strong>{' '}
                      {item.driverRating !== null
                        ? t('driverRating.summary', {
                            rating: item.driverRating.toFixed(1),
                            count: item.driverReviewCount,
                          })
                        : t('driverRating.none')}
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

          <div className="flex items-center justify-between gap-4">
            <Button
              type="button"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('pagination.previous')}
            </Button>
            <span className="text-sm text-muted-foreground">{t('pagination.page', { page })}</span>
            <Button
              type="button"
              variant="outline"
              disabled={!data.hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('pagination.next')}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
