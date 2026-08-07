import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, type = 'text', ...inputProps }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'h-11 w-full rounded-md bg-card px-4 text-sm text-foreground shadow-sm ring-1 ring-border outline-none transition-all duration-200',
          'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...inputProps}
      />
    );
  },
);
