'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import type { DriverPayoutStatus } from '@carpool/schemas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchAdminPayouts, markAdminPayoutPaid } from '@/lib/admin';
import { ADMIN_FILTER_TRIGGER, AdminFilterBar, AdminQueueState } from './admin-queue-state';

const STATUSES: Array<DriverPayoutStatus | 'all'> = ['all', 'held', 'due', 'frozen', 'paid', 'cancelled'];

const STATUS_BADGE: Record<DriverPayoutStatus, 'warning' | 'primary' | 'destructive' | 'success' | 'neutral'> = {
  held: 'warning',
  due: 'primary',
  frozen: 'destructive',
  paid: 'success',
  cancelled: 'neutral',
};

export function AdminPayoutQueue() {
  const t = useTranslations('Admin');
  const tPayouts = useTranslations('Admin.payouts');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<DriverPayoutStatus | 'all'>('due');
  const [refs, setRefs] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ['admin', 'payouts', status],
    queryFn: () => fetchAdminPayouts(status === 'all' ? undefined : status),
  });

  const markPaid = useMutation({
    mutationFn: ({ id, ref }: { id: string; ref: string }) => markAdminPayoutPaid(id, ref),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'payouts'] });
    },
  });

  const rows = query.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <AdminFilterBar>
          <Select value={status} onValueChange={(value) => setStatus(value as DriverPayoutStatus | 'all')}>
            <SelectTrigger className={ADMIN_FILTER_TRIGGER} aria-label={tPayouts('status')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {tPayouts(`statusFilter.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
      </AdminFilterBar>

      <AdminQueueState
        isLoading={query.isLoading}
        isError={query.isError}
        empty={rows.length === 0}
        loadingLabel={tPayouts('loading')}
        errorLabel={tPayouts('error')}
        emptyLabel={tPayouts('empty')}
        retryLabel={t('retry')}
        onRetry={() => void query.refetch()}
      >
        <Card className="gap-0 py-0">
          <CardContent className="divide-y divide-border p-0">
            {rows.map((row) => (
              <article key={row.id} className="grid gap-3 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-base font-semibold tabular-nums tracking-tight text-foreground">
                      {format.number(row.amountCents / 100, {
                        style: 'currency',
                        currency: row.currency.toUpperCase(),
                      })}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {tPayouts('dueAt')}{' '}
                      {format.dateTime(new Date(row.dueAt), { dateStyle: 'medium', timeStyle: 'short' })}
                      {' · '}
                      {tPayouts('booking')} {row.bookingId.slice(0, 8)}
                    </p>
                  </div>
                  <Badge variant={STATUS_BADGE[row.status]}>{tPayouts(`statusValue.${row.status}`)}</Badge>
                </div>
                {row.status === 'held' || row.status === 'due' ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      className="h-9 sm:w-44"
                      placeholder={tPayouts('refPlaceholder')}
                      value={refs[row.id] ?? ''}
                      onChange={(event) =>
                        setRefs((current) => ({ ...current, [row.id]: event.target.value }))
                      }
                    />
                    <Button
                      size="sm"
                      disabled={markPaid.isPending || (refs[row.id] ?? '').trim().length < 4}
                      onClick={() => markPaid.mutate({ id: row.id, ref: (refs[row.id] ?? '').trim() })}
                    >
                      {tPayouts('markPaid')}
                    </Button>
                  </div>
                ) : row.status === 'frozen' ? (
                  <p className="text-xs text-muted-foreground">{tPayouts('frozenHint')}</p>
                ) : row.paidRef ? (
                  <p className="text-xs text-muted-foreground">{row.paidRef}</p>
                ) : null}
              </article>
            ))}
          </CardContent>
        </Card>
      </AdminQueueState>
    </div>
  );
}
