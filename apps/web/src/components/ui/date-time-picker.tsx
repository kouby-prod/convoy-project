'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { CalendarDays, Clock } from 'lucide-react';
import { Popover } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { TimePicker, formatTime, DEFAULT_TIME, type TimeValue } from '@/components/ui/time-picker';
import { cn } from '@/lib/utils';

interface DateTimePickerProps {
  value?: { date?: Date; time?: TimeValue };
  onChange: (value: { date?: Date; time?: TimeValue }) => void;
  className?: string;
}

export function DateTimePicker({
  value = { date: undefined, time: DEFAULT_TIME },
  onChange,
  className,
}: DateTimePickerProps) {
  const locale = useLocale();
  const [isOpenDate, setIsOpenDate] = useState(false);

  const selectedDate = value.date;
  const selectedTime = value.time ?? DEFAULT_TIME;

  const formattedDate = selectedDate
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(selectedDate)
    : null;

  return (
    <div className={cn('flex gap-4', className)}>
      <Popover
        open={isOpenDate}
        onOpenChange={setIsOpenDate}
        className="flex-1"
        trigger={
          <button
            type="button"
            aria-label="Select date"
            onClick={() => setIsOpenDate((prev) => !prev)}
            className={cn(
              'flex h-12 items-center justify-between gap-2 rounded-md bg-card px-5 text-sm shadow-sm ring-1 ring-border outline-none transition-all duration-200 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30',
            )}
          >
            <span className={cn('truncate', formattedDate ? 'text-foreground' : 'text-muted-foreground')}>
              {formattedDate ?? 'Select date'}
            </span>
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
          </button>
        }
      >
        <Calendar
          locale={locale}
          selected={selectedDate}
          onSelect={(date) => {
            onChange({ date, time: selectedTime });
            setIsOpenDate(false);
          }}
        />
      </Popover>

      <div className="w-32">
        <TimePicker
          value={selectedTime}
          onChange={(time) => onChange({ date: selectedDate, time })}
          ariaLabel="Select time"
        />
      </div>
    </div>
  );
}
