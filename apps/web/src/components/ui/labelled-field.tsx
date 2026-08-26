import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { FormAlert } from '@/components/ui/form-alert';

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
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium leading-none text-foreground">
        {label}
      </label>
      {children}
      {error ? <FormAlert id={`${htmlFor}-error`}>{error}</FormAlert> : null}
    </div>
  );
}
