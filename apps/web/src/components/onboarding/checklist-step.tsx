import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ChecklistStep({
  index,
  title,
  description,
  done,
  locked,
  href,
  cta,
  extra,
}: {
  index: number;
  title: string;
  description: string;
  done: boolean;
  locked?: boolean;
  href?: string;
  cta?: string;
  extra?: ReactNode;
}) {
  return (
    <li
      className={cn(
        'flex gap-4 rounded-md p-4 ring-1 ring-border',
        locked && 'opacity-60',
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-md text-sm font-semibold',
          done ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary',
        )}
        aria-hidden
      >
        {done ? <Check className="size-4" strokeWidth={2.5} /> : index}
      </span>
      <div className="grid min-w-0 flex-1 gap-2">
        <div className="grid gap-1">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {extra}
        {href && cta && !locked ? (
          <Link
            href={href}
            className={cn(buttonVariants({ variant: done ? 'outline' : 'primary', size: 'sm' }), 'w-fit')}
          >
            {cta}
          </Link>
        ) : null}
      </div>
    </li>
  );
}
