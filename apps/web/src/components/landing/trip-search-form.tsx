'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DropdownDatePicker } from '@/components/ui/dropdown-date-picker';
import { DropdownTimePicker } from '@/components/ui/dropdown-time-picker';
import { DEFAULT_TIME, type TimeValue } from '@/components/ui/time-picker';

/* The hero trip-search form: city inputs, a calendar date-picker, and a
   segmented time-picker (defaults to 12:00 AM). */
export function TripSearchForm() {
  const translateHero = useTranslations('Hero');
  const [departureDate, setDepartureDate] = useState<Date>();
  const [departureTime, setDepartureTime] = useState<TimeValue>(DEFAULT_TIME);

  return (
    <form className="flex flex-col gap-3">
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
