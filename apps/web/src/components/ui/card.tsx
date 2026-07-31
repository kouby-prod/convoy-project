import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

/* Surface on-system: heavy radius, soft shadow over a hairline ring (never a
   plain border). */
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card(
  { className, ...cardProps },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-4xl bg-card text-card-foreground shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10',
        className,
      )}
      {...cardProps}
    />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...headerProps }, ref) {
    return <div ref={ref} className={cn('flex flex-col gap-1.5 p-6', className)} {...headerProps} />;
  },
);

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...titleProps }, ref) {
    return (
      <h3
        ref={ref}
        className={cn('text-xl font-semibold tracking-tight', className)}
        {...titleProps}
      />
    );
  },
);

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...contentProps }, ref) {
    return <div ref={ref} className={cn('p-6 pt-0', className)} {...contentProps} />;
  },
);

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function CardDescription({ className, ...descriptionProps }, ref) {
    return (
      <p
        ref={ref}
        className={cn('text-sm text-muted-foreground', className)}
        {...descriptionProps}
      />
    );
  },
);
