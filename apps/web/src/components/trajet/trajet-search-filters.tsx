'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUpDown, Minus, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { StopPolicySchema, type StopPolicy, type TrajetAmenity } from '@carpool/schemas';
import { useRouter } from '@/i18n/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CityCombobox } from '@/components/ui/city-combobox';
import { LabelledField } from '@/components/ui/labelled-field';
import { DropdownDatePicker, dateToParam, paramToDate } from '@/components/ui/dropdown-date-picker';
import { DropdownTimePicker } from '@/components/ui/dropdown-time-picker';
import { formatTime, parseTime } from '@/components/ui/time-picker';
import { FilterSheet } from '@/components/ui/filter-sheet';
import { AmenityToggleGroup, GENERAL_AMENITIES, isAmenity } from '@/components/trajet/trajet-amenities';
import { DateQuickChips, RecentSearchChips, SeatsStepper } from '@/components/trajet/search-chips';
import { rememberSearch } from '@/lib/recent-searches';

type Layout = 'rail' | 'sheet';

/* Left-hand search rail on /trajet. Filters live in the URL so results are
   shareable and Back restores the previous search. On small screens the same
   form opens from a sticky bar as a bottom sheet. */
export function TrajetSearchFilters({ layout = 'rail' }: { layout?: Layout }) {
  const t = useTranslations('Trajet');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fieldId = useId().replace(/:/g, '');
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [seats, setSeats] = useState('1');
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
    const nextSeats = searchParams.get('seats') ?? '1';
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
    setIsAdvancedOpen(Boolean(nextMaxPrice) || nextAmenities.length > 0 || nextStop !== 'any');
  }, [searchParams]);

  const hasActiveFilters = useMemo(
    () =>
      Boolean(from.trim() || to.trim() || date || time || (seats && seats !== '1') || maxPrice) ||
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
    setSheetOpen(false);
    router.push('/trajet');
  }

  function applyFilters() {
    const params = new URLSearchParams();
    if (from.trim()) params.set('from', from.trim());
    if (to.trim()) params.set('to', to.trim());
    if (date) params.set('date', date);
    if (time) params.set('time', time);
    if (seats) params.set('seats', seats);
    if (maxPrice) params.set('maxPrice', maxPrice);
    for (const amenity of amenities) params.append('amenities', amenity);
    if (stopPolicy !== 'any') params.set('stopPolicy', stopPolicy);

    rememberSearch({ from: from.trim(), to: to.trim(), date: date || undefined, seats: seats || undefined });

    const query = params.toString();
    router.push(query ? `/trajet?${query}` : '/trajet');
    setSheetOpen(false);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyFilters();
  }

  const form = (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {layout === 'rail' ? (
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">{t('filters.title')}</h2>
          {hasActiveFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="h-8 px-2">
              <X className="size-3.5" strokeWidth={2.25} />
              {t('filters.clear')}
            </Button>
          ) : null}
        </div>
      ) : null}

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
            className="h-9 gap-1.5 px-3 text-xs text-muted-foreground"
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
        <LabelledField label={t('filters.date')} htmlFor={`${fieldId}-date`}>
          <DropdownDatePicker
            id={`${fieldId}-date`}
            value={paramToDate(date)}
            onChange={(next) => setDate(dateToParam(next))}
            placeholder={t('filters.date')}
            aria-label={t('filters.date')}
          />
        </LabelledField>
        <LabelledField label={t('filters.time')} htmlFor={`${fieldId}-time`}>
          <DropdownTimePicker
            id={`${fieldId}-time`}
            value={parseTime(time)}
            onChange={(next) => setTime(formatTime(next))}
            ariaLabel={t('filters.time')}
          />
        </LabelledField>
      </div>

      <DateQuickChips
        date={date}
        onChange={setDate}
        todayLabel={t('filters.today')}
        tomorrowLabel={t('filters.tomorrow')}
        groupLabel={t('filters.dateChips')}
      />
      <RecentSearchChips groupLabel={t('filters.recent')} refreshKey={searchParams.toString()} />

      <SeatsStepper
        value={seats}
        onChange={setSeats}
        label={t('filters.seats')}
        minusLabel={t('filters.seatsMinus')}
        plusLabel={t('filters.seatsPlus')}
        countLabel={(count) => t('filters.seatsValue', { count })}
      />

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
          <LabelledField label={t('filters.maxPrice')} htmlFor={`${fieldId}-max-price`}>
            <Input
              type="number"
              id={`${fieldId}-max-price`}
              min={0}
              name="maxPrice"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
            />
          </LabelledField>

          <AmenityToggleGroup
            selected={amenities}
            onToggle={toggleAmenity}
            label={(amenity) => t(`amenities.${amenity}`)}
            legend={t('filters.amenitiesLegend')}
            amenities={GENERAL_AMENITIES}
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

      {layout === 'rail' ? (
        <Button type="submit" variant="primary" size="lg" className="mt-1 w-full font-semibold">
          <Search className="size-4" strokeWidth={2.25} />
          {t('filters.submit')}
        </Button>
      ) : null}
    </form>
  );

  if (layout === 'sheet') {
    const parsedDate = paramToDate(date);
    const dateLabel = parsedDate
      ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(parsedDate)
      : null;
    const route =
      from.trim() && to.trim()
        ? t('filters.summaryRoute', { from: from.trim(), to: to.trim() })
        : from.trim() || to.trim() || t('filters.summaryEmpty');
    const seatCount = Math.max(1, Number.parseInt(seats, 10) || 1);
    const summary = [route, dateLabel, t('filters.seatsValue', { count: seatCount })].filter(Boolean).join(' · ');

    return (
      <>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label={`${t('filters.openSheet')}: ${summary}`}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-card px-3 py-2 text-left shadow-sm ring-1 ring-border outline-none transition-all duration-200 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <SlidersHorizontal className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} aria-hidden />
            <span className="min-w-0 truncate text-sm font-medium text-foreground">{summary}</span>
          </button>
          <Button type="button" variant="secondary" size="sm" className="h-11 shrink-0 px-3" onClick={() => setSheetOpen(true)}>
            {t('filters.openSheet')}
          </Button>
        </div>
        <FilterSheet
          open={sheetOpen}
          onClose={closeSheet}
          title={t('filters.sheetTitle')}
          closeLabel={t('filters.closeSheet')}
          footer={
            <div className="flex gap-2">
              {hasActiveFilters ? (
                <Button type="button" variant="outline" className="shrink-0" onClick={clearFilters}>
                  {t('filters.clear')}
                </Button>
              ) : null}
              <Button type="button" variant="primary" size="lg" className="min-w-0 flex-1 font-semibold" onClick={applyFilters}>
                <Search className="size-4" strokeWidth={2.25} />
                {t('filters.submit')}
              </Button>
            </div>
          }
        >
          {form}
        </FilterSheet>
      </>
    );
  }

  return (
    <Card className="h-fit lg:sticky lg:top-20">
      <CardContent className="p-5 pt-5">{form}</CardContent>
    </Card>
  );
}
