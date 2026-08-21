'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { fetchAdminIncidents, resolveAdminIncident } from '@/lib/admin';

export function AdminIncidentQueue() {
  const t = useTranslations('Admin.incidents');
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

  if (query.isLoading) return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  if (query.isError) return <p className="text-sm text-destructive">{t('error')}</p>;

  const rows = query.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {(['open', 'resolved'] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={status === value ? 'primary' : 'outline'}
            onClick={() => setStatus(value)}
          >
            {t(`statusFilter.${value}`)}
          </Button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t('kind')}</th>
                <th className="px-3 py-2">{t('provider')}</th>
                <th className="px-3 py-2">{t('when')}</th>
                <th className="px-3 py-2">{t('action')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{row.kind}</td>
                  <td className="px-3 py-2">{row.provider ?? '—'}</td>
                  <td className="px-3 py-2">
                    {format.dateTime(new Date(row.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                  <td className="px-3 py-2">
                    {row.status === 'open' ? (
                      <Button size="sm" disabled={resolve.isPending} onClick={() => resolve.mutate(row.id)}>
                        {t('resolve')}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t('resolved')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
