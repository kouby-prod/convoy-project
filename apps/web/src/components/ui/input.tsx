import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

/* Text/date/time field on-system: pill radius, hairline ring (not a border),
   3px brand focus ring. */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, type = 'text', ...inputProps }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'h-12 w-full rounded-full bg-card px-5 text-sm text-foreground shadow-sm ring-1 ring-border outline-none transition-all duration-200',
          'placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/30',
          className,
        )}
        {...inputProps}
      />
    );
  },
);
