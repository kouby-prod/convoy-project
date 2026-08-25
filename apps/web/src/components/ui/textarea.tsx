import { type TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/* Multi-line field on-system: matches Input (hairline ring, 3px brand focus
   ring) but with the heavy card radius rather than a pill. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, rows = 4, ...textareaProps }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(
          'w-full resize-y rounded-md bg-card px-4 py-3 text-sm text-foreground shadow-sm ring-1 ring-border outline-none transition-all duration-200',
          'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...textareaProps}
      />
    );
  },
);
