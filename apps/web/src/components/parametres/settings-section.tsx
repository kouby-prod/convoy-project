import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Titled block matching an in-page section nav item. */
export function SettingsSection({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn('scroll-mt-32 grid gap-4 lg:scroll-mt-28', className)}>
      <h2 className="font-display text-base font-semibold tracking-tight text-foreground sm:text-lg">
        {title}
      </h2>
      {children}
    </section>
  );
}
