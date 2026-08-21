import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** City → city used on trip rows (search, my rides, my bookings). */
export function TripRoute({
  from,
  to,
  className,
}: {
  from: string;
  to: string;
  className?: string;
}) {
  return (
    <p className={cn('flex min-w-0 items-center gap-1.5 font-semibold text-foreground', className)}>
      <span className="min-w-0 truncate">{from}</span>
      <ArrowRight className="size-3.5 shrink-0 text-brand-blue" strokeWidth={2.25} aria-hidden />
      <span className="min-w-0 truncate">{to}</span>
    </p>
  );
}
