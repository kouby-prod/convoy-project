import { type HTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/* Status pill on-system: heavy radius, tinted fill over the semantic token
   rather than a saturated block, so a row of them stays readable next to body
   text. Colour carries meaning, never decoration — see `documentStatusVariant`
   in components/documents/document-status-badge.tsx. */
export const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1.5 rounded-3xl px-3 py-1 text-xs font-semibold whitespace-nowrap transition-all duration-200 [&>svg]:size-3.5',
  {
    variants: {
      variant: {
        neutral: 'bg-muted text-muted-foreground ring-1 ring-foreground/5',
        primary: 'bg-primary/10 text-primary ring-1 ring-primary/20',
        success: 'bg-secondary/15 text-secondary ring-1 ring-secondary/25',
        warning: 'bg-accent/25 text-accent-foreground ring-1 ring-accent-foreground/10',
        destructive: 'bg-destructive/10 text-destructive ring-1 ring-destructive/20',
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
