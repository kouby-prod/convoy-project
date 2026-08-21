'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchAdminIncidents, resolveAdminIncident } from '@/lib/admin';
import { ADMIN_FILTER_TRIGGER, AdminFilterBar, AdminQueueState } from './admin-queue-state';

export function AdminIncidentQueue() {
  const t = useTranslations('Admin');
  const tIncidents = useTranslations('Admin.incidents');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'open' | 'resolved'>('open');

  const query = useQuery({
    queryKey: ['admin', 'incidents', status],
    queryFn: () => fetchAdminIncidents(status),
  });

  const resolve = useMutation({
    mutationFn: (id: string) => resolveAdminIncident(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'incidents'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });

  const rows = query.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <AdminFilterBar>
          <Select value={status} onValueChange={(value) => setStatus(value as 'open' | 'resolved')}>
            <SelectTrigger className={ADMIN_FILTER_TRIGGER} aria-label={t('filters.status')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">{tIncidents('statusFilter.open')}</SelectItem>
              <SelectItem value="resolved">{tIncidents('statusFilter.resolved')}</SelectItem>
            </SelectContent>
          </Select>
      </AdminFilterBar>

      <AdminQueueState
        isLoading={query.isLoading}
        isError={query.isError}
        empty={rows.length === 0}
        loadingLabel={tIncidents('loading')}
        errorLabel={tIncidents('error')}
        emptyLabel={tIncidents('empty')}
        retryLabel={t('retry')}
        onRetry={() => void query.refetch()}
      >
        <Card className="gap-0 py-0">
          <CardContent className="divide-y divide-border p-0">
            {rows.map((row) => (
              <article key={row.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-mono text-sm text-foreground">{row.kind}</p>
                    <Badge variant={row.status === 'open' ? 'warning' : 'success'}>
                      {row.status === 'open' ? tIncidents('statusFilter.open') : tIncidents('resolved')}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.provider ?? '—'}
                    {' · '}
                    {format.dateTime(new Date(row.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
                {row.status === 'open' ? (
                  <Button size="sm" disabled={resolve.isPending} onClick={() => resolve.mutate(row.id)}>
                    {tIncidents('resolve')}
                  </Button>
                ) : null}
              </article>
            ))}
          </CardContent>
        </Card>
      </AdminQueueState>
    </div>
  );
}
