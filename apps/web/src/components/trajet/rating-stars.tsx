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
