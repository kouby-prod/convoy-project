'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DropdownDatePicker } from '@/components/ui/dropdown-date-picker';
import { DropdownTimePicker } from '@/components/ui/dropdown-time-picker';
import { DEFAULT_TIME, formatTime, type TimeValue } from '@/components/ui/time-picker';
import { toDateKey } from '@/lib/trajets';

/* The hero trip-search form: city inputs, a calendar date-picker, and a
   segmented time-picker (defaults to 12:00 AM). Submitting hands the criteria
   to /trajet through the query string, where the search rail picks them up. */
export function TripSearchForm() {
  const translateHero = useTranslations('Hero');
  const router = useRouter();
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [departureDate, setDepartureDate] = useState<Date>();
  const [departureTime, setDepartureTime] = useState<TimeValue>(DEFAULT_TIME);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const params = new URLSearchParams();
    if (departure.trim()) params.set('from', departure.trim());
    if (arrival.trim()) params.set('to', arrival.trim());
    // The picker has no empty state — it pre-fills today. Sending that as a
    // filter would silently hide every later ride, so a visitor who only typed
    // two cities would be told there are none. Today's value means "any day";
    // rides today still match, because no date filter is applied at all.
    if (departureDate && toDateKey(departureDate) !== toDateKey(new Date())) {
      params.set('date', toDateKey(departureDate));
    }
    // Midnight is the picker's untouched default — not a real "leave after" filter.
    if (departureTime.hour !== 0 || departureTime.minute !== 0) {
      params.set('time', formatTime(departureTime));
    }

    const query = params.toString();
    router.push(query ? `/trajet?${query}` : '/trajet');
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Input
        name="departure"
        value={departure}
        onChange={(event) => setDeparture(event.target.value)}
        placeholder={translateHero('departurePlaceholder')}
      />
      <Input
        name="arrival"
        value={arrival}
        onChange={(event) => setArrival(event.target.value)}
        placeholder={translateHero('arrivalPlaceholder')}
      />
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
