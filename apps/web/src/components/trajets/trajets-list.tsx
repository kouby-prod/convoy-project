'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations, useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { createApiClient } from '@carpool/api-client';
import { useRouter, Link } from '@/i18n/navigation';
import { env } from '@/lib/env';
import { formatCad, koubyFeeCents } from '@/lib/booking-money';
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
import { ListSkeleton } from '@/components/ui/list-skeleton';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

const COMFORT_ANY = 'all';

const DRIVER_RATING_ANY = 'all';

const RADIUS_ANY = 'all';

interface Filters {
  departureCity: string;
  destinationCity: string;
  date: string;
  comfort: string;
  maxPrice: string;
  minSeats: string;
  baggageAllowance: string;
  minDriverRating: string;
  nearLat: string;
  nearLng: string;
  radiusKm: string;
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
  nearLat: '',
  nearLng: '',
  radiusKm: RADIUS_ANY,
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
    nearLat: searchParams.get('nearLat') ?? '',
    nearLng: searchParams.get('nearLng') ?? '',
    radiusKm: searchParams.get('radiusKm') ?? RADIUS_ANY,
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
  // radiusKm is meaningless (and ignored server-side) without a location.
  if (filters.nearLat && filters.nearLng) {
    query.nearLat = filters.nearLat;
    query.nearLng = filters.nearLng;
    if (filters.radiusKm !== RADIUS_ANY) query.radiusKm = filters.radiusKm;
  }
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
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => filtersFromSearchParams(searchParams));
  const [page, setPage] = useState(1);
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

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

  function useMyLocation() {
    setGeoError(null);
    if (!('geolocation' in navigator)) {
      setGeoError(t('filters.geoUnsupported'));
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFilters((prev) => ({
          ...prev,
          nearLat: String(position.coords.latitude),
          nearLng: String(position.coords.longitude),
        }));
        setIsLocating(false);
      },
      () => {
        setGeoError(t('filters.geoDenied'));
        setIsLocating(false);
      },
    );
  }

  function clearLocation() {
    setGeoError(null);
    setFilters((prev) => ({ ...prev, nearLat: '', nearLng: '', radiusKm: RADIUS_ANY }));
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(toQuery(filters));
    router.push(`/trajets${params.toString() ? `?${params.toString()}` : ''}`);
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setGeoError(null);
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

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={isLocating}
            onClick={useMyLocation}
          >
            {isLocating
              ? t('filters.locating')
              : filters.nearLat
                ? t('filters.locationSet')
                : t('filters.useMyLocation')}
          </Button>
          {filters.nearLat ? (
            <Button type="button" variant="ghost" size="sm" onClick={clearLocation}>
              {t('filters.clearLocation')}
            </Button>
          ) : null}
        </div>
        {filters.nearLat && filters.nearLng ? (
          <Select value={filters.radiusKm} onValueChange={(value) => updateFilter('radiusKm', value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={RADIUS_ANY}>{t('filters.radiusAny')}</SelectItem>
              {[10, 25, 50, 100, 200].map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {t('filters.radiusValue', { value })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {geoError ? <p className="text-sm text-destructive sm:col-span-2 lg:col-span-4">{geoError}</p> : null}

        <div className="flex gap-2">
          <Button type="submit" className="flex-1">
            {t('filters.apply')}
          </Button>
          <Button type="button" variant="outline" onClick={resetFilters}>
            {t('filters.reset')}
          </Button>
        </div>
      </form>

      {isLoading ? <ListSkeleton label={t('loading')} /> : null}
      {isError ? <p role="alert" className="text-destructive">{t('error')}</p> : null}
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
                      <Link href={`/trajet/${item.id}`} className="hover:underline">
                        {item.departureCity} - {item.destinationCity}
                      </Link>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 px-6 pb-6 pt-0 text-sm text-muted-foreground">
                    <div>
                      <strong className="text-foreground">{t('departureAt')}:</strong>{' '}
                      {formatDateTime(item.departureDateTime)}
                    </div>
                    {item.distanceKm !== null ? (
                      <div>
                        <strong className="text-foreground">{t('distance.label')}:</strong>{' '}
                        {t('distance.value', { km: item.distanceKm.toFixed(1) })}
                      </div>
                    ) : null}
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
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {t('plusKoubyFee', { amount: formatCad(koubyFeeCents(), locale) })}
                      </span>
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
