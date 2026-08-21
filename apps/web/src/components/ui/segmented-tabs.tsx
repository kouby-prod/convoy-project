import { cn } from '@/lib/utils';

export type SegmentedTab<T extends string> = {
  id: T;
  label: string;
  count?: number;
};

/**
 * Compact tablist used on My rides / My bookings / inbox.
 * Label sits above the count so a narrow column never ellipsizes the word.
 */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: SegmentedTab<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('grid grid-cols-3 gap-1 rounded-md bg-muted p-1', className)}
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={cn(
              'inline-flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5 text-center outline-none transition-all duration-200',
              'focus-visible:ring-3 focus-visible:ring-ring/30',
              selected
                ? 'bg-card text-foreground shadow-sm ring-1 ring-foreground/10'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="text-xs font-medium leading-tight">{tab.label}</span>
            {typeof tab.count === 'number' ? (
              <span
                className={cn(
                  'text-[11px] tabular-nums leading-none',
                  selected ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
