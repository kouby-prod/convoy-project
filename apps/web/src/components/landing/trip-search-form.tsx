'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpDown, Search } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { CityCombobox } from '@/components/ui/city-combobox';
import { DropdownDatePicker, dateToParam, paramToDate } from '@/components/ui/dropdown-date-picker';
import { DropdownTimePicker } from '@/components/ui/dropdown-time-picker';
import { formatTime, type TimeValue } from '@/components/ui/time-picker';
import { DateQuickChips, RecentSearchChips, SeatsStepper } from '@/components/trajet/search-chips';
import { rememberSearch } from '@/lib/recent-searches';

export function TripSearchForm() {
  const translateHero = useTranslations('Hero');
  const tFilters = useTranslations('Trajet.filters');
  const router = useRouter();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [departureDate, setDepartureDate] = useState<Date>();
  const [departureTime, setDepartureTime] = useState<TimeValue>();
  const [seats, setSeats] = useState('1');

  function swapCities() {
    setFrom(to);
    setTo(from);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const params = new URLSearchParams();
    const departure = from.trim();
    const arrival = to.trim();
    if (departure) params.set('from', departure);
    if (arrival) params.set('to', arrival);
    if (departureDate) {
      params.set('date', dateToParam(departureDate));
      if (departureTime) params.set('time', formatTime(departureTime));
    }
    if (seats) params.set('seats', seats);

    rememberSearch({ from: departure, to: arrival, date: departureDate ? dateToParam(departureDate) : undefined, seats });

    const queryString = params.toString();
    router.push(`/trajet${queryString ? `?${queryString}` : ''}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative z-20 flex flex-col gap-3 rounded-lg bg-card p-4 shadow-md ring-1 ring-foreground/5 sm:p-5"
    >
      <div className="flex flex-col gap-2">
        <CityCombobox
          name="from"
          value={from}
          onChange={setFrom}
          placeholder={translateHero('departurePlaceholder')}
          aria-label={translateHero('departurePlaceholder')}
          required
        />
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={swapCities}
            aria-label={tFilters('swap')}
            className="h-9 gap-1.5 px-3 text-xs text-muted-foreground"
          >
            <ArrowUpDown className="size-3.5" strokeWidth={2.25} />
            {tFilters('swapShort')}
          </Button>
        </div>
        <CityCombobox
          name="to"
          value={to}
          onChange={setTo}
          placeholder={translateHero('arrivalPlaceholder')}
          aria-label={translateHero('arrivalPlaceholder')}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <DropdownDatePicker
          value={departureDate}
          onChange={setDepartureDate}
          placeholder={translateHero('dateLabel')}
          aria-label={translateHero('dateLabel')}
          className="w-full"
        />
        <DropdownTimePicker
          value={departureTime}
          onChange={setDepartureTime}
          ariaLabel={translateHero('timeLabel')}
          className="w-full"
        />
      </div>
      <DateQuickChips
        date={departureDate ? dateToParam(departureDate) : ''}
        onChange={(next) => setDepartureDate(next ? paramToDate(next) : undefined)}
        todayLabel={tFilters('today')}
        tomorrowLabel={tFilters('tomorrow')}
        groupLabel={tFilters('dateChips')}
      />
      <RecentSearchChips groupLabel={tFilters('recent')} />
      <SeatsStepper
        value={seats}
        onChange={setSeats}
        label={tFilters('seats')}
        minusLabel={tFilters('seatsMinus')}
        plusLabel={tFilters('seatsPlus')}
        countLabel={(count) => tFilters('seatsValue', { count })}
      />
      <Button type="submit" size="lg" className="mt-1 w-full font-semibold">
        <Search className="size-4" strokeWidth={2.25} />
        {translateHero('search')}
      </Button>
    </form>
  );
}
