import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ListSkeleton } from '@/components/ui/list-skeleton';

export const ADMIN_FILTER_TRIGGER =
  'h-9 min-w-36 rounded-md border-0 bg-muted px-3 text-sm shadow-none ring-1 ring-border';

export const ADMIN_FILTER_INPUT = 'h-9 px-3 shadow-none';

export function AdminFilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

export function AdminSearch({
  value,
  onChange,
  onSubmit,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  label: string;
}) {
  return (
    <form
      className="flex min-w-48 flex-1 gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={ADMIN_FILTER_INPUT}
      />
      <Button type="submit" variant="outline" size="icon" className="size-9" aria-label={label}>
        <Search className="size-4" strokeWidth={2.5} aria-hidden />
      </Button>
    </form>
  );
}

/** Shared empty / error / skeleton for every backoffice queue. */
export function AdminQueueState({
  isLoading,
  isError,
  empty,
  loadingLabel,
  errorLabel,
  emptyLabel,
  retryLabel,
  onRetry,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  empty: boolean;
  loadingLabel: string;
  errorLabel: string;
  emptyLabel: string;
  retryLabel?: string;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (isLoading) return <ListSkeleton rows={5} label={loadingLabel} />;
  if (isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-8 pt-8 text-center">
          <p className="text-sm text-destructive">{errorLabel}</p>
          {onRetry && retryLabel ? (
            <Button size="sm" variant="outline" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }
  if (empty) {
    return (
      <Card>
        <CardContent className="p-8 pt-8 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </CardContent>
      </Card>
    );
  }
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>;
}
