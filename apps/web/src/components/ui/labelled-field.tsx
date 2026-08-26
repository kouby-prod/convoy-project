import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A visible label above a field.
 *
 * Native `date`/`time` inputs ignore `placeholder` — they render the browser's
 * own format hint (`mm/dd/yyyy`, `--:-- --`) with nothing naming them — and
 * narrow numeric fields clip theirs. Both need a real label, which also gives
 * the field a click target.
 */
export function LabelledField({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="px-1 text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
