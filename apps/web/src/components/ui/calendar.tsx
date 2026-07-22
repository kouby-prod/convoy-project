'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CalendarProps {
  selected?: Date;
  onSelect: (date: Date) => void;
  /** BCP-47 tag used for month/weekday names (e.g. 'fr', 'en'). */
  locale: string;
  captionLayout?: 'buttons' | 'dropdown';
  defaultMonth?: Date;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/* Dependency-free month calendar. Monday-first; month and weekday names come
   from Intl so they follow the active locale. */
export function Calendar({
  selected,
  onSelect,
  locale,
  captionLayout = 'buttons',
  defaultMonth,
}: CalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selected ?? defaultMonth ?? new Date()));
  const today = new Date();

  const weekdayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    // 2024-01-01 is a Monday — build a Mon→Sun reference week.
    return Array.from({ length: 7 }, (_, dayOffset) =>
      formatter.format(new Date(2024, 0, 1 + dayOffset)),
    );
  }, [locale]);

  const monthLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'long' });
    return Array.from({ length: 12 }, (_, monthIndex) =>
      formatter.format(new Date(2024, monthIndex, 1)),
    );
  }, [locale]);

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  }).format(viewMonth);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Offset so the 1st lands under the right weekday (0 = Monday).
  const leadingBlanks = (new Date(year, month, 1).getDay() + 6) % 7;

  function goToMonth(offset: number) {
    setViewMonth(new Date(year, month + offset, 1));
  }

  return (
    <div className="w-full">
      {/* Month navigation */}
      <div className="flex items-center justify-between px-1 pb-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => goToMonth(-1)}
          className="flex size-9 items-center justify-center rounded-full text-foreground outline-none transition-all duration-200 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <ChevronLeft className="size-4" strokeWidth={2.25} />
        </button>
        {captionLayout === 'dropdown' ? (
          <div className="flex items-center gap-2">
            <select
              aria-label="Month"
              value={month}
              onChange={(event) => setViewMonth(new Date(year, Number(event.target.value), 1))}
              className="rounded-full border border-border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              {monthLabels.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="Year"
              value={year}
              onChange={(event) => setViewMonth(new Date(Number(event.target.value), month, 1))}
              className="rounded-full border border-border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              {Array.from({ length: 21 }, (_, index) => year - 10 + index).map((yearOption) => (
                <option key={yearOption} value={yearOption}>
                  {yearOption}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <span className="text-sm font-semibold capitalize tracking-tight">{monthLabel}</span>
        )}
        <button
          type="button"
          aria-label="Next month"
          onClick={() => goToMonth(1)}
          className="flex size-9 items-center justify-center rounded-full text-foreground outline-none transition-all duration-200 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <ChevronRight className="size-4" strokeWidth={2.25} />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 pb-1">
        {weekdayLabels.map((label) => (
          <span
            key={label}
            className="flex h-8 items-center justify-center text-xs font-medium capitalize text-muted-foreground"
          >
            {label}
          </span>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }, (_, blankIndex) => (
          <span key={`blank-${blankIndex}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, dayIndex) => {
          const day = dayIndex + 1;
          const date = new Date(year, month, day);
          const isSelected = selected && isSameDay(date, selected);
          const isToday = isSameDay(date, today);
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelect(date)}
              aria-pressed={isSelected}
              className={cn(
                'flex aspect-square w-full items-center justify-center rounded-full text-sm outline-none transition-all duration-200 focus-visible:ring-3 focus-visible:ring-ring/30',
                isSelected
                  ? 'bg-primary font-semibold text-primary-foreground hover:bg-primary/80'
                  : 'hover:bg-muted',
                !isSelected && isToday && 'font-semibold text-primary',
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
