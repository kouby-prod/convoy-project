'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import type { DriverPayoutStatus } from '@carpool/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchAdminPayouts, markAdminPayoutPaid } from '@/lib/admin';

const STATUSES: Array<DriverPayoutStatus | 'all'> = ['all', 'held', 'due', 'frozen', 'paid', 'cancelled'];

export function AdminPayoutQueue() {
  const t = useTranslations('Admin.payouts');
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

  if (query.isLoading) return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  if (query.isError) return <p className="text-sm text-destructive">{t('error')}</p>;

  const rows = query.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((value) => (
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
                <th className="px-3 py-2">{t('amount')}</th>
                <th className="px-3 py-2">{t('status')}</th>
                <th className="px-3 py-2">{t('dueAt')}</th>
                <th className="px-3 py-2">{t('booking')}</th>
                <th className="px-3 py-2">{t('action')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2 tabular-nums">
                    {format.number(row.amountCents / 100, { style: 'currency', currency: row.currency.toUpperCase() })}
                  </td>
                  <td className="px-3 py-2">{t(`statusValue.${row.status}`)}</td>
                  <td className="px-3 py-2">{format.dateTime(new Date(row.dueAt), { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.bookingId.slice(0, 8)}</td>
                  <td className="px-3 py-2">
                    {row.status === 'held' || row.status === 'due' ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          className="h-8 w-36"
                          placeholder={t('refPlaceholder')}
                          value={refs[row.id] ?? ''}
                          onChange={(event) => setRefs((current) => ({ ...current, [row.id]: event.target.value }))}
                        />
                        <Button
                          size="sm"
                          disabled={markPaid.isPending || (refs[row.id] ?? '').trim().length < 4}
                          onClick={() => markPaid.mutate({ id: row.id, ref: (refs[row.id] ?? '').trim() })}
                        >
                          {t('markPaid')}
                        </Button>
                      </div>
                    ) : row.status === 'frozen' ? (
                      <span className="text-xs text-muted-foreground">{t('frozenHint')}</span>
                    ) : row.paidRef ? (
                      <span className="text-xs text-muted-foreground">{row.paidRef}</span>
                    ) : (
                      '—'
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
