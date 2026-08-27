import { type InputHTMLAttributes, type ReactNode, forwardRef } from 'react';
import { cn } from '@/lib/utils';

/* Checkbox + label as one focusable row. `accent-primary` keeps the native
   control (and its keyboard/AT behaviour) while painting it with the brand
   token — no custom control to re-implement. `label` is a node so terms
   copy can include locale Links. */
export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, label, ...inputProps },
  ref,
) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2.5 text-sm text-foreground select-none',
        className,
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        className="size-4 shrink-0 accent-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        {...inputProps}
      />
      {label}
    </label>
  );
});
