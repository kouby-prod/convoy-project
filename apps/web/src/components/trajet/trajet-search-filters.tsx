'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowUpDown, Minus, Plus, Search, X } from 'lucide-react';
import { StopPolicySchema, type StopPolicy, type TrajetAmenity } from '@carpool/schemas';
import { useRouter } from '@/i18n/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CityCombobox } from '@/components/ui/city-combobox';
import { LabelledField } from '@/components/ui/labelled-field';
import { AmenityToggleGroup, isAmenity } from '@/components/trajet/trajet-amenities';

/* Left-hand search rail on /trajet. Filters live in the URL so results are
   shareable and Back restores the previous search. */
export function TrajetSearchFilters() {
  const t = useTranslations('Trajet');
  const router = useRouter();
  const searchParams = useSearchParams();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [seats, setSeats] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [amenities, setAmenities] = useState<TrajetAmenity[]>([]);
  const [stopPolicy, setStopPolicy] = useState<StopPolicy>('any');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // Keep local fields in sync when the URL changes (hero search, Back, navbar).
  useEffect(() => {
    const nextFrom = searchParams.get('from') ?? '';
    const nextTo = searchParams.get('to') ?? '';
    const nextDate = searchParams.get('date') ?? '';
    const nextTime = searchParams.get('time') ?? '';
    const nextSeats = searchParams.get('seats') ?? '';
    const nextMaxPrice = searchParams.get('maxPrice') ?? '';
    const nextAmenities = searchParams.getAll('amenities').filter(isAmenity);
    const nextStop = StopPolicySchema.catch('any').parse(searchParams.get('stopPolicy'));

    setFrom(nextFrom);
    setTo(nextTo);
    setDate(nextDate);
    setTime(nextTime);
    setSeats(nextSeats);
    setMaxPrice(nextMaxPrice);
    setAmenities(nextAmenities);
    setStopPolicy(nextStop);
    setIsAdvancedOpen(
      Boolean(nextSeats || nextMaxPrice) || nextAmenities.length > 0 || nextStop !== 'any',
    );
  }, [searchParams]);

  const hasActiveFilters = useMemo(
    () =>
      Boolean(from.trim() || to.trim() || date || time || seats || maxPrice) ||
      amenities.length > 0 ||
      stopPolicy !== 'any',
    [from, to, date, time, seats, maxPrice, amenities, stopPolicy],
  );

  function toggleAmenity(amenity: TrajetAmenity) {
    setAmenities((current) =>
      current.includes(amenity)
        ? current.filter((entry) => entry !== amenity)
        : [...current, amenity],
    );
  }

  /** `direct` and `withStops` are mutually exclusive; unchecking either means "any". */
  function toggleStopPolicy(policy: Exclude<StopPolicy, 'any'>) {
    setStopPolicy((current) => (current === policy ? 'any' : policy));
  }

  function swapCities() {
    setFrom(to);
    setTo(from);
  }

  function clearFilters() {
    router.push('/trajet');
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const params = new URLSearchParams();
    if (from.trim()) params.set('from', from.trim());
    if (to.trim()) params.set('to', to.trim());
    if (date) params.set('date', date);
    if (time) params.set('time', time);
    if (seats) params.set('seats', seats);
    if (maxPrice) params.set('maxPrice', maxPrice);
    for (const amenity of amenities) params.append('amenities', amenity);
    if (stopPolicy !== 'any') params.set('stopPolicy', stopPolicy);

    const query = params.toString();
    router.push(query ? `/trajet?${query}` : '/trajet');
  }

  return (
    <Card className="h-fit lg:sticky lg:top-20">
      <CardContent className="p-5 pt-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">{t('filters.title')}</h2>
            {hasActiveFilters ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="h-8 px-2">
                <X className="size-3.5" strokeWidth={2.25} />
                {t('filters.clear')}
              </Button>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <CityCombobox
              name="from"
              value={from}
              onChange={setFrom}
              placeholder={t('filters.from')}
              aria-label={t('filters.from')}
            />
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={swapCities}
                aria-label={t('filters.swap')}
                className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground"
              >
                <ArrowUpDown className="size-3.5" strokeWidth={2.25} />
                {t('filters.swapShort')}
              </Button>
            </div>
            <CityCombobox
              name="to"
              value={to}
              onChange={setTo}
              placeholder={t('filters.to')}
              aria-label={t('filters.to')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <LabelledField label={t('filters.date')} htmlFor="filter-date">
              <Input
                type="date"
                id="filter-date"
                name="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </LabelledField>
            <LabelledField label={t('filters.time')} htmlFor="filter-time">
              <Input
                type="time"
                id="filter-time"
                name="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </LabelledField>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsAdvancedOpen((isOpen) => !isOpen)}
            aria-expanded={isAdvancedOpen}
            className="self-start px-1 text-brand-blue"
          >
            {isAdvancedOpen ? <Minus className="size-4" /> : <Plus className="size-4" />}
            {isAdvancedOpen ? t('filters.less') : t('filters.more')}
          </Button>

          {isAdvancedOpen ? (
            <div className="flex flex-col gap-4 border-t border-border pt-4">
              <div className="grid grid-cols-2 gap-3">
                <LabelledField label={t('filters.seats')} htmlFor="filter-seats">
                  <Input
                    type="number"
                    id="filter-seats"
                    min={1}
                    max={8}
                    name="seats"
                    value={seats}
                    onChange={(event) => setSeats(event.target.value)}
                    className="h-10 px-4"
                  />
                </LabelledField>
                <LabelledField label={t('filters.maxPrice')} htmlFor="filter-max-price">
                  <Input
                    type="number"
                    id="filter-max-price"
                    min={0}
                    name="maxPrice"
                    value={maxPrice}
                    onChange={(event) => setMaxPrice(event.target.value)}
                    className="h-10 px-4"
                  />
                </LabelledField>
              </div>

              <AmenityToggleGroup
                selected={amenities}
                onToggle={toggleAmenity}
                label={(amenity) => t(`amenities.${amenity}`)}
                legend={t('filters.amenitiesLegend')}
              />

              <div className="flex flex-col gap-2.5">
                <Checkbox
                  name="direct"
                  checked={stopPolicy === 'direct'}
                  onChange={() => toggleStopPolicy('direct')}
                  label={t('filters.direct')}
                />
                <Checkbox
                  name="withStops"
                  checked={stopPolicy === 'withStops'}
                  onChange={() => toggleStopPolicy('withStops')}
                  label={t('filters.withStops')}
                />
              </div>
            </div>
          ) : null}

          <Button type="submit" variant="primary" size="lg" className="mt-1 w-full font-semibold">
            <Search className="size-4" strokeWidth={2.25} />
            {t('filters.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
