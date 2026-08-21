import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

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
            <div className="h-10 w-16 animate-pulse rounded-md bg-muted" />
            <div className="space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded-md bg-muted" />
            </div>
            <div className="h-8 w-16 animate-pulse rounded-md bg-muted sm:justify-self-end" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
