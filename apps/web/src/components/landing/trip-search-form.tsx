'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { CityCombobox } from '@/components/ui/city-combobox';
import { DropdownDatePicker } from '@/components/ui/dropdown-date-picker';
import { DropdownTimePicker } from '@/components/ui/dropdown-time-picker';
import { DEFAULT_TIME, formatTime, type TimeValue } from '@/components/ui/time-picker';

function toDateParam(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function TripSearchForm() {
  const translateHero = useTranslations('Hero');
  const router = useRouter();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [departureDate, setDepartureDate] = useState<Date>();
  const [departureTime, setDepartureTime] = useState<TimeValue>(DEFAULT_TIME);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // `/trajet` reads TrajetSearchQuery (`from`/`to`/`date`/`time`);
    // lib/trajets maps those onto GET /trajets departureCity/destinationCity.
    const params = new URLSearchParams();
    const departure = from.trim();
    const arrival = to.trim();
    if (departure) params.set('from', departure);
    if (arrival) params.set('to', arrival);
    if (departureDate) {
      params.set('date', toDateParam(departureDate));
      params.set('time', formatTime(departureTime));
    }

    const queryString = params.toString();
    router.push(`/trajet${queryString ? `?${queryString}` : ''}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative z-20 flex flex-col gap-3 rounded-lg bg-card p-4 shadow-md ring-1 ring-foreground/5 sm:p-5"
    >
      <CityCombobox
        name="from"
        value={from}
        onChange={setFrom}
        placeholder={translateHero('departurePlaceholder')}
        aria-label={translateHero('departurePlaceholder')}
        required
      />
      <CityCombobox
        name="to"
        value={to}
        onChange={setTo}
        placeholder={translateHero('arrivalPlaceholder')}
        aria-label={translateHero('arrivalPlaceholder')}
        required
      />
      <div className="grid grid-cols-2 gap-3">
        <DropdownDatePicker
          value={departureDate}
          onChange={setDepartureDate}
          placeholder={translateHero('dateLabel')}
          className="w-full"
        />
        <DropdownTimePicker
          value={departureTime}
          onChange={setDepartureTime}
          ariaLabel={translateHero('timeLabel')}
          className="w-full"
        />
      </div>
      <Button type="submit" size="lg" className="mt-1 w-full sm:w-auto sm:self-start sm:px-10">
        <Search className="size-4" strokeWidth={2.25} />
        {translateHero('search')}
      </Button>
    </form>
  );
}
