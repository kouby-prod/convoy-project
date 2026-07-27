import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/* Canonical button on the Dream design system: pill radius, soft shadow over a
   hairline ring, opacity-shift hover, 1px press, 3px brand focus ring.
   Exported `buttonVariants` lets non-button elements (e.g. <Link>) borrow the
   same styling without an extra wrapper. */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap outline-none transition-all duration-200 ease-smooth active:translate-y-px focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground shadow-md ring-1 ring-foreground/5 hover:bg-primary/80',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        accent:
          'bg-accent text-accent-foreground shadow-md ring-1 ring-foreground/5 hover:bg-accent/80',
        outline: 'bg-card text-foreground shadow-sm ring-1 ring-border hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 px-4 text-sm',
        default: 'h-11 px-6 text-sm',
        lg: 'h-12 px-8 text-base',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = 'button', ...buttonProps },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...buttonProps}
    />
  );
});
