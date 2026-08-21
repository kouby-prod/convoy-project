import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RatingStarsProps {
  /** Average score, 0–5. */
  rating: number;
  /** Accessible sentence, e.g. "4,6 sur 5 (87 avis)". */
  label: string;
  className?: string;
}

/* The "Avis" column: five stars, filled up to the rounded score. */
export function RatingStars({ rating, label, className }: RatingStarsProps) {
  const filled = Math.round(Math.min(Math.max(rating, 0), 5));

  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} title={label}>
      {[0, 1, 2, 3, 4].map((index) => (
        <Star
          key={index}
          aria-hidden
          className={cn(
            'size-4',
            index < filled ? 'fill-primary text-primary' : 'fill-transparent text-muted-foreground/40',
          )}
          strokeWidth={1.75}
        />
      ))}
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Interactive 1–5 rating for review forms. */
export function RatingStarInput({
  value,
  onChange,
  label,
  valueLabel,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  valueLabel: (value: number) => string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((score) => {
        const selected = score === value;
        const filled = score <= value;
        return (
          <button
            key={score}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={valueLabel(score)}
            disabled={disabled}
            onClick={() => onChange(score)}
            className="rounded-md p-1 outline-none transition-all duration-200 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50"
          >
            <Star
              aria-hidden
              className={cn(
                'size-6',
                filled ? 'fill-primary text-primary' : 'fill-transparent text-muted-foreground/40',
              )}
              strokeWidth={1.75}
            />
          </button>
        );
      })}
    </div>
  );
}
