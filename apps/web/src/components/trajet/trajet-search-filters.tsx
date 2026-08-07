'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus, Minus, Search } from 'lucide-react';
import { StopPolicySchema, type StopPolicy, type TrajetAmenity } from '@carpool/schemas';
import { useRouter } from '@/i18n/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { LabelledField } from '@/components/ui/labelled-field';
import { AmenityToggleGroup, isAmenity } from '@/components/trajet/trajet-amenities';

/* The left-hand search rail on /trajet. Filters live in the URL, so a result
   set is shareable and the browser Back button restores the previous search. */
export function TrajetSearchFilters() {
  const t = useTranslations('Trajet');
  const router = useRouter();
  const searchParams = useSearchParams();

  const [from, setFrom] = useState(searchParams.get('from') ?? '');
  const [to, setTo] = useState(searchParams.get('to') ?? '');
  const [date, setDate] = useState(searchParams.get('date') ?? '');
  const [time, setTime] = useState(searchParams.get('time') ?? '');
  const [seats, setSeats] = useState(searchParams.get('seats') ?? '');
  const [maxPrice, setMaxPrice] = useState(searchParams.get('maxPrice') ?? '');
  const [amenities, setAmenities] = useState<TrajetAmenity[]>(
    searchParams.getAll('amenities').filter(isAmenity),
  );
  const [stopPolicy, setStopPolicy] = useState<StopPolicy>(
    StopPolicySchema.catch('any').parse(searchParams.get('stopPolicy')),
  );

  // Open the advanced block when the current URL already uses one of its filters.
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(
    Boolean(seats || maxPrice) || amenities.length > 0 || stopPolicy !== 'any',
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
    <Card className="h-fit">
      <CardContent className="p-5 pt-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            name="from"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            placeholder={t('filters.from')}
            aria-label={t('filters.from')}
          />
          <Input
            name="to"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder={t('filters.to')}
            aria-label={t('filters.to')}
          />

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
            variant="link"
            size="sm"
            onClick={() => setIsAdvancedOpen((isOpen) => !isOpen)}
            aria-expanded={isAdvancedOpen}
            className="self-center"
          >
            {isAdvancedOpen ? <Minus className="size-4" /> : <Plus className="size-4" />}
            {t('filters.more')}
          </Button>

          {isAdvancedOpen && (
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
          )}

          <Button type="submit" variant="accent" size="lg" className="mt-2 self-center px-10">
            <Search className="size-5" strokeWidth={2.25} />
            {t('filters.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
