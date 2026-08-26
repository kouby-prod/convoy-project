import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Shared page intro used across feature routes after the redesign. */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="max-w-2xl space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-blue">Convoy</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        {subtitle ? <p className="text-sm leading-relaxed text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
