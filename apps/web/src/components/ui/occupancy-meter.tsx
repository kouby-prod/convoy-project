import { cn } from '@/lib/utils';

/**
 * Seat fill as a short meter — scannable on a trip row without reading
 * "seats: 2/4". Caps visual ticks at 8 (the product max).
 */
export function OccupancyMeter({
  taken,
  total,
  label,
  className,
}: {
  taken: number;
  total: number;
  label: string;
  className?: string;
}) {
  const ticks = Math.min(Math.max(total, 1), 8);
  const filled = Math.min(Math.max(taken, 0), ticks);

  return (
    <div className={cn('flex items-center gap-2', className)} role="img" aria-label={label}>
      <span className="flex gap-0.5" aria-hidden>
        {Array.from({ length: ticks }, (_, index) => (
          <span
            key={index}
            className={cn(
              'h-1.5 w-2.5 rounded-sm',
              index < filled ? 'bg-brand-green' : 'bg-muted-foreground/20',
            )}
          />
        ))}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground" aria-hidden>
        {taken}/{total}
      </span>
    </div>
  );
}
