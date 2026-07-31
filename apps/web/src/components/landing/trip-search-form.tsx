'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DropdownDatePicker } from '@/components/ui/dropdown-date-picker';
import { DropdownTimePicker } from '@/components/ui/dropdown-time-picker';
import { DEFAULT_TIME, type TimeValue } from '@/components/ui/time-picker';

function toDateParam(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/* The hero trip-search form: city inputs, a calendar date-picker, and a
   segmented time-picker (defaults to 12:00 AM). Submitting navigates to
   /trajets with the search carried over as query params — the time picker
   only shapes the departure display elsewhere, it isn't filterable (an exact
   minute rarely matches, so /trajets only filters by calendar day). */
export function TripSearchForm() {
  const translateHero = useTranslations('Hero');
  const router = useRouter();
  const [departureDate, setDepartureDate] = useState<Date>();
  const [departureTime, setDepartureTime] = useState<TimeValue>(DEFAULT_TIME);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const departureCity = formData.get('departure')?.toString().trim();
    const destinationCity = formData.get('arrival')?.toString().trim();

    const params = new URLSearchParams();
    if (departureCity) params.set('departureCity', departureCity);
    if (destinationCity) params.set('destinationCity', destinationCity);
    if (departureDate) params.set('date', toDateParam(departureDate));

    const queryString = params.toString();
    router.push(`/trajets${queryString ? `?${queryString}` : ''}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Input name="departure" placeholder={translateHero('departurePlaceholder')} />
      <Input name="arrival" placeholder={translateHero('arrivalPlaceholder')} />
      <div className="grid grid-cols-2 gap-3">
        <DropdownDatePicker
          value={departureDate}
          onChange={setDepartureDate}
          placeholder={translateHero('dateLabel')}
        />
        <DropdownTimePicker
          value={departureTime}
          onChange={setDepartureTime}
          ariaLabel={translateHero('timeLabel')}
        />
      </div>
      <Button type="submit" size="lg" className="mt-2 self-center px-10">
        <Search className="size-5" strokeWidth={2.25} />
        {translateHero('search')}
      </Button>
    </form>
  );
}
