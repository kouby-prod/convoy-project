import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card(
  { className, ...cardProps },
  ref,
) {
  return (
    <div
      ref={ref}
      data-slot="card"
      className={cn(
        'group/card flex flex-col gap-6 overflow-hidden rounded-lg bg-card py-6 text-sm text-card-foreground shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10',
        className,
      )}
      {...cardProps}
    />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...headerProps }, ref) {
    return (
      <div
        ref={ref}
        data-slot="card-header"
        className={cn('grid auto-rows-min items-start gap-1.5 px-6', className)}
        {...headerProps}
      />
    );
  },
);

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...titleProps }, ref) {
    return (
      <h3
        ref={ref}
        data-slot="card-title"
        className={cn('font-heading text-base font-medium tracking-tight', className)}
        {...titleProps}
      />
    );
  },
);

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...contentProps }, ref) {
    return (
      <div ref={ref} data-slot="card-content" className={cn('px-6', className)} {...contentProps} />
    );
  },
);

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function CardDescription({ className, ...descriptionProps }, ref) {
    return (
      <p
        ref={ref}
        data-slot="card-description"
        className={cn('text-sm text-muted-foreground', className)}
        {...descriptionProps}
      />
    );
  },
);

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...footerProps }, ref) {
    return (
      <div
        ref={ref}
        data-slot="card-footer"
        className={cn('flex items-center px-6', className)}
        {...footerProps}
      />
    );
  },
);
