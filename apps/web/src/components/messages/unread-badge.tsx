import { cn } from '@/lib/utils';

/** Count pill for unread threads (inbox row + navbar). */
export function UnreadBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none text-primary-foreground',
        className,
      )}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}
