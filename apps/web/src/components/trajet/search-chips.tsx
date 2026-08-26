'use client';

import { useEffect, useState } from 'react';
import { Minus, Plus, UserRound } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { dateToParam } from '@/components/ui/dropdown-date-picker';
import { cn } from '@/lib/utils';
import { readRecentSearches, recentSearchHref, recentSearchKey, type RecentSearch } from '@/lib/recent-searches';

export function startOfLocalDay(offsetDays = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date;
}

export function todayParam() {
  return dateToParam(startOfLocalDay(0));
}

export function tomorrowParam() {
  return dateToParam(startOfLocalDay(1));
}

export function DateQuickChips({
  date,
  onChange,
  todayLabel,
  tomorrowLabel,
  groupLabel,
}: {
  date: string;
  onChange: (next: string) => void;
  todayLabel: string;
  tomorrowLabel: string;
  groupLabel: string;
}) {
  const today = todayParam();
  const tomorrow = tomorrowParam();

  return (
    <div role="group" aria-label={groupLabel} className="flex flex-wrap gap-2">
      <Chip
        pressed={date === today}
        onClick={() => onChange(date === today ? '' : today)}
        label={todayLabel}
      />
      <Chip
        pressed={date === tomorrow}
        onClick={() => onChange(date === tomorrow ? '' : tomorrow)}
        label={tomorrowLabel}
      />
    </div>
  );
}

export function RecentSearchChips({
  groupLabel,
  refreshKey,
}: {
  groupLabel: string;
  refreshKey?: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<RecentSearch[]>([]);

  useEffect(() => {
    setItems(readRecentSearches());
  }, [refreshKey]);

  if (items.length === 0) return null;

  return (
    <div role="group" aria-label={groupLabel} className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Chip
          key={recentSearchKey(item)}
          pressed={false}
          onClick={() => router.push(recentSearchHref(item))}
          label={`${item.from} → ${item.to}`}
        />
      ))}
    </div>
  );
}

function Chip({
  pressed,
  onClick,
  label,
}: {
  pressed: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        buttonVariants({ variant: 'outline', size: 'sm' }),
        'h-9 px-3',
        pressed && 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/85',
      )}
    >
      {label}
    </button>
  );
}

/** Passenger seat count. Empty URL value still displays 1; the parent decides whether to persist it. */
export function SeatsStepper({
  value,
  onChange,
  label,
  minusLabel,
  plusLabel,
  countLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  minusLabel: string;
  plusLabel: string;
  countLabel: (count: number) => string;
}) {
  const count = Math.min(8, Math.max(1, Number.parseInt(value, 10) || 1));

  return (
    <div className="flex h-11 items-center justify-between gap-2 rounded-md bg-card px-2 shadow-sm ring-1 ring-border">
      <span className="flex min-w-0 items-center gap-2 px-2 text-sm font-medium text-foreground">
        <UserRound className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} aria-hidden />
        <span className="truncate">{label}</span>
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9"
          aria-label={minusLabel}
          disabled={count <= 1}
          onClick={() => onChange(String(count - 1))}
        >
          <Minus className="size-4" strokeWidth={2.25} />
        </Button>
        <span className="sr-only" aria-live="polite">
          {countLabel(count)}
        </span>
        <span className="min-w-6 text-center text-sm font-semibold tabular-nums" aria-hidden>
          {count}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9"
          aria-label={plusLabel}
          disabled={count >= 8}
          onClick={() => onChange(String(count + 1))}
        >
          <Plus className="size-4" strokeWidth={2.25} />
        </Button>
      </div>
    </div>
  );
}
