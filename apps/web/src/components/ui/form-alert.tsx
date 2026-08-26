import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Inline error that screen readers announce when it appears. */
export function FormAlert({
  children,
  id,
  className,
}: {
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <p id={id} role="alert" className={cn('text-sm text-destructive', className)}>
      {children}
    </p>
  );
}

/** Inline success / status that is announced without interrupting. */
export function FormStatus({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p role="status" className={cn('text-sm text-success', className)}>
      {children}
    </p>
  );
}
