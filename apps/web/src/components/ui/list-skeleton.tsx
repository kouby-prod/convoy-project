import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Placeholder rows that keep list layout from jumping to a paragraph. */
export function ListSkeleton({
  rows = 3,
  label,
  className,
}: {
  rows?: number;
  label: string;
  className?: string;
}) {
  return (
    <Card className={cn('gap-0 py-0', className)} aria-busy aria-label={label}>
      <CardContent className="divide-y divide-border p-0">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="grid gap-3 px-5 py-4 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto]">
            <Skeleton className="h-10 w-16" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-8 w-16 sm:justify-self-end" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Form / checkout card while session or data is in flight. */
export function CardSkeleton({
  label,
  rows = 4,
  className,
}: {
  label: string;
  rows?: number;
  className?: string;
}) {
  return (
    <Card className={cn('gap-0 py-0', className)} aria-busy aria-label={label}>
      <CardContent className="space-y-3 p-6">
        <Skeleton className="h-5 w-32" />
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

/** Passenger ride detail: itinerary + sticky book panel. */
export function DetailSkeleton({ label }: { label: string }) {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]" aria-busy aria-label={label}>
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

/** Booking / checkout rail in a card shell. */
export function PanelSkeleton({ label, className }: { label: string; className?: string }) {
  return (
    <div
      className={cn(
        'grid gap-3 rounded-lg bg-card p-4 shadow-md ring-1 ring-foreground/5 sm:p-5',
        className,
      )}
      aria-busy
      aria-label={label}
    >
      <Skeleton className="h-8 w-28" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

/** Left-hand search filters while the URL-bound form hydrates. */
export function FilterSkeleton({ label }: { label: string }) {
  return (
    <Card className="h-fit lg:sticky lg:top-20" aria-busy aria-label={label}>
      <CardContent className="space-y-3 p-5 pt-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </CardContent>
    </Card>
  );
}

/** Compact sticky filter bar while the mobile sheet trigger hydrates. */
export function FilterBarSkeleton({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2" aria-busy aria-label={label}>
      <Skeleton className="h-11 flex-1" />
      <Skeleton className="h-11 w-24" />
    </div>
  );
}

/** Chat bubbles while the thread history loads. */
export function ThreadSkeleton({ label }: { label: string }) {
  return (
    <div className="grid content-start gap-2 px-1 py-2" aria-busy aria-label={label}>
      <Skeleton className="h-12 w-3/5 rounded-md" />
      <Skeleton className="ml-auto h-16 w-2/3 rounded-md" />
      <Skeleton className="h-12 w-1/2 rounded-md" />
    </div>
  );
}
