'use client';

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type SegmentedTab<T extends string> = {
  id: T;
  label: string;
  count?: number;
};

const COL_CLASS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

/**
 * Compact WAI-ARIA tablist (arrow keys, roving tabindex, aria-controls).
 * Pair with `TabPanel` using the same `id`.
 *
 * `default` is the three-up list filter (My rides / bookings / inbox).
 * `compact` is the original inline pill bar (notifications, driver workspace).
 */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  id,
  size = 'default',
  className,
}: {
  tabs: SegmentedTab<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  id: string;
  size?: 'default' | 'compact';
  className?: string;
}) {
  const fallbackId = useId().replace(/:/g, '');
  const prefix = id || fallbackId;
  const tabRefs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({});
  const ids = tabs.map((tab) => tab.id);
  const compact = size === 'compact';
  const columns = COL_CLASS[tabs.length] ?? 'grid-cols-3';

  function activate(next: T, viaKeyboard: boolean) {
    onChange(next);
    if (viaKeyboard) {
      requestAnimationFrame(() => tabRefs.current[next]?.focus());
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = ids.indexOf(value);
    if (index < 0) return;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      activate(ids[(index + 1) % ids.length]!, true);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      activate(ids[(index - 1 + ids.length) % ids.length]!, true);
    } else if (event.key === 'Home') {
      event.preventDefault();
      activate(ids[0]!, true);
    } else if (event.key === 'End') {
      event.preventDefault();
      activate(ids[ids.length - 1]!, true);
    }
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        compact
          ? 'inline-flex w-fit items-center gap-1 rounded-md bg-muted p-1'
          : cn('grid gap-1 rounded-md bg-muted p-1', columns),
        className,
      )}
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              tabRefs.current[tab.id] = node;
            }}
            type="button"
            role="tab"
            id={`${prefix}-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${prefix}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => activate(tab.id, false)}
            className={cn(
              'outline-none transition-all duration-200 focus-visible:ring-3 focus-visible:ring-ring/30',
              compact
                ? 'inline-flex min-h-8 items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium'
                : 'inline-flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5 text-center',
              selected
                ? 'bg-card text-foreground shadow-sm ring-1 ring-foreground/10'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className={compact ? undefined : 'text-xs font-medium leading-tight'}>
              {tab.label}
            </span>
            {typeof tab.count === 'number' ? (
              <span
                className={cn(
                  'tabular-nums',
                  compact ? 'text-sm' : 'text-[11px] leading-none',
                  selected ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {compact ? `(${tab.count})` : tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Panel owned by a `SegmentedTabs` control with the matching `tabsId`. */
export function TabPanel({
  tabsId,
  tab,
  children,
  className,
}: {
  tabsId: string;
  tab: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      id={`${tabsId}-panel-${tab}`}
      role="tabpanel"
      aria-labelledby={`${tabsId}-tab-${tab}`}
      className={className}
    >
      {children}
    </div>
  );
}
