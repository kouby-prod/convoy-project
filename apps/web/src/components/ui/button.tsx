import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/* Brand buttons: yellow primary CTA, green secondary, blue text links.
   Heavy radius, opacity hover, press translate, blue focus ring. */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md border border-transparent font-medium whitespace-nowrap outline-none transition-all duration-200 ease-smooth active:translate-y-px focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground shadow-md ring-1 ring-foreground/10 hover:bg-primary/85',
        secondary:
          'bg-secondary text-secondary-foreground shadow-md ring-1 ring-foreground/5 hover:bg-secondary/85',
        accent: 'bg-accent text-accent-foreground shadow-sm ring-1 ring-foreground/5 hover:bg-accent/80',
        outline:
          'border-border bg-background text-foreground shadow-sm hover:bg-muted dark:bg-transparent dark:hover:bg-input/30',
        ghost: 'text-foreground hover:bg-muted',
        link: 'rounded-none text-brand-blue underline-offset-4 hover:underline',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20',
      },
      size: {
        sm: 'h-8 gap-1 px-3 text-sm',
        default: 'h-9 gap-1.5 px-3 text-sm',
        lg: 'h-11 gap-1.5 px-5 text-base',
        icon: 'size-9',
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
