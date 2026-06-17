'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { CalendarDays } from 'lucide-react';
import { Popover } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  value?: Date;
  onChange: (date: Date) => void;
  placeholder: string;
  className?: string;
}

/* Field-style trigger (matches Input) that opens a calendar popover. */
export function DatePicker({ value, onChange, placeholder, className }: DatePickerProps) {
  const locale = useLocale();
  const [isOpen, setIsOpen] = useState(false);

  const formattedDate = value
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(value)
    : null;

  return (
    <Popover
      open={isOpen}
      onOpenChange={setIsOpen}
      className="w-full"
      trigger={
        <button
          type="button"
          aria-label={placeholder}
          onClick={() => setIsOpen((previous) => !previous)}
          className={cn(
            'flex h-12 w-full items-center justify-between gap-2 rounded-full bg-card px-5 text-sm shadow-sm ring-1 ring-border outline-none transition-all duration-200 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30',
            className,
          )}
        >
          <span className={cn('truncate', formattedDate ? 'text-foreground' : 'text-muted-foreground')}>
            {formattedDate ?? placeholder}
          </span>
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
        </button>
      }
    >
      <Calendar
        locale={locale}
        selected={value}
        onSelect={(date) => {
          onChange(date);
          setIsOpen(false);
        }}
      />
    </Popover>
  );
}
