'use client';

import { useLocale } from 'next-intl';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScrollDatePickerProps {
  value?: Date;
  onChange: (date: Date) => void;
  placeholder: string;
  className?: string;
}

/**
 * Scroll-based date picker with separate day, month, and year selectors.
 * Each segment is independently scrollable via wheel or arrow keys.
 */
export function ScrollDatePicker({ value, onChange, placeholder, className }: ScrollDatePickerProps) {
  const locale = useLocale();

  // Current values
  const selectedDay = value?.getDate() ?? 1;
  const selectedMonth = value?.getMonth() ?? 0;
  const selectedYear = value?.getFullYear() ?? new Date().getFullYear();

  // Generate arrays for selectors
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const months = Array.from({ length: 12 }, (_, i) => i);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - 50 + i);

  // Month names
  const monthNames = new Intl.DateTimeFormat(locale, { month: 'long' }).resolvedOptions();
  const formatter = new Intl.DateTimeFormat(locale, { month: 'long' });

  function getMonthName(monthIndex: number) {
    return formatter.format(new Date(2000, monthIndex, 1));
  }

  function createDate(day: number, month: number, year: number) {
    const newDate = new Date(year, month, day);
    onChange(newDate);
  }

  function handleDayChange(delta: number) {
    let newDay = selectedDay + delta;
    let newMonth = selectedMonth;
    let newYear = selectedYear;

    // Get days in current month
    const daysInMonth = new Date(newYear, newMonth + 1, 0).getDate();

    if (newDay > daysInMonth) {
      newDay = (newDay - 1) % daysInMonth + 1;
      newMonth = (newMonth + 1) % 12;
      if (newMonth === 0) newYear += 1;
    } else if (newDay < 1) {
      newMonth = newMonth === 0 ? 11 : newMonth - 1;
      if (newMonth === 11) newYear -= 1;
      newDay = new Date(newYear, newMonth + 1, 0).getDate();
    }

    createDate(newDay, newMonth, newYear);
  }

  function handleMonthChange(delta: number) {
    let newMonth = (selectedMonth + delta + 12) % 12;
    let newYear = selectedYear;

    if (selectedMonth + delta < 0) {
      newYear -= 1;
      newMonth = 11;
    } else if (selectedMonth + delta >= 12) {
      newYear += 1;
      newMonth = 0;
    }

    // Ensure day is valid for new month
    const daysInMonth = new Date(newYear, newMonth + 1, 0).getDate();
    const day = Math.min(selectedDay, daysInMonth);

    createDate(day, newMonth, newYear);
  }

  function handleYearChange(delta: number) {
    const newYear = selectedYear + delta;
    const daysInMonth = new Date(newYear, selectedMonth + 1, 0).getDate();
    const day = Math.min(selectedDay, daysInMonth);

    createDate(day, selectedMonth, newYear);
  }

  const formattedDate = value
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(value)
    : null;

  const segmentClass =
    'flex items-center justify-center rounded-lg px-2 py-1 outline-none transition-all duration-200 hover:bg-muted focus:bg-accent focus:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/30';

  return (
    <div
      className={cn(
        'flex h-12 w-full items-center gap-2 rounded-md bg-card px-5 text-sm text-foreground shadow-sm ring-1 ring-border flex-col',
        className,
      )}
    >
      {/* Display current date */}
      <div className="flex items-center gap-2 w-full">
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
        <span className={cn(formattedDate ? 'text-foreground' : 'text-muted-foreground', 'flex-1')}>
          {formattedDate ?? placeholder}
        </span>
      </div>

      {/* Scroll selectors */}
      <div className="grid grid-cols-3 gap-1 w-full px-2 py-2 bg-muted/20 rounded-lg">
        {/* Day selector */}
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => handleDayChange(1)}
            className="text-xs px-1 hover:text-foreground transition-colors"
            aria-label="Increment day"
          >
            ▲
          </button>
          <div
            className={cn(segmentClass, 'w-full')}
            onWheel={(e) => {
              e.preventDefault();
              handleDayChange(e.deltaY < 0 ? 1 : -1);
            }}
            role="spinbutton"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') handleDayChange(1);
              if (e.key === 'ArrowDown') handleDayChange(-1);
            }}
          >
            <span className="font-medium tabular-nums">{String(selectedDay).padStart(2, '0')}</span>
          </div>
          <button
            type="button"
            onClick={() => handleDayChange(-1)}
            className="text-xs px-1 hover:text-foreground transition-colors"
            aria-label="Decrement day"
          >
            ▼
          </button>
          <span className="text-xs text-muted-foreground">Jour</span>
        </div>

        {/* Month selector */}
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => handleMonthChange(1)}
            className="text-xs px-1 hover:text-foreground transition-colors"
            aria-label="Increment month"
          >
            ▲
          </button>
          <div
            className={cn(segmentClass, 'w-full text-xs')}
            onWheel={(e) => {
              e.preventDefault();
              handleMonthChange(e.deltaY < 0 ? 1 : -1);
            }}
            role="spinbutton"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') handleMonthChange(1);
              if (e.key === 'ArrowDown') handleMonthChange(-1);
            }}
          >
            <span className="font-medium">{getMonthName(selectedMonth).slice(0, 3)}</span>
          </div>
          <button
            type="button"
            onClick={() => handleMonthChange(-1)}
            className="text-xs px-1 hover:text-foreground transition-colors"
            aria-label="Decrement month"
          >
            ▼
          </button>
          <span className="text-xs text-muted-foreground">Mois</span>
        </div>

        {/* Year selector */}
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => handleYearChange(1)}
            className="text-xs px-1 hover:text-foreground transition-colors"
            aria-label="Increment year"
          >
            ▲
          </button>
          <div
            className={cn(segmentClass, 'w-full')}
            onWheel={(e) => {
              e.preventDefault();
              handleYearChange(e.deltaY < 0 ? 1 : -1);
            }}
            role="spinbutton"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') handleYearChange(1);
              if (e.key === 'ArrowDown') handleYearChange(-1);
            }}
          >
            <span className="font-medium">{selectedYear}</span>
          </div>
          <button
            type="button"
            onClick={() => handleYearChange(-1)}
            className="text-xs px-1 hover:text-foreground transition-colors"
            aria-label="Decrement year"
          >
            ▼
          </button>
          <span className="text-xs text-muted-foreground">Année</span>
        </div>
      </div>
    </div>
  );
}
