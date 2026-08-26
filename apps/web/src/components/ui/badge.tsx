import { type HTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/* Status pill: colour carries meaning. `success` uses the dedicated success
   token so it stays green after secondary became a neutral Dream fill. */
export const badgeVariants = cva(
  'inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-transparent px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-all [&>svg]:size-3',
  {
    variants: {
      variant: {
        neutral: 'bg-muted text-muted-foreground',
        primary: 'bg-primary text-primary-foreground',
        success: 'bg-success/15 text-success ring-1 ring-success/25',
        warning: 'bg-warning/25 text-warning-foreground ring-1 ring-warning-foreground/10',
        destructive: 'bg-destructive/10 text-destructive ring-1 ring-destructive/20',
        secondary: 'bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant, ...badgeProps },
  ref,
) {
  return <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...badgeProps} />;
});
