'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { AdminTrajetStateSchema, type AdminTrajetQuery, type AdminTrajetState } from '@carpool/schemas';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Link } from '@/i18n/navigation';
import { fetchAdminTrajets } from '@/lib/admin';
import { cn } from '@/lib/utils';
import { ADMIN_FILTER_INPUT, ADMIN_FILTER_TRIGGER, AdminFilterBar, AdminQueueState, AdminSearch } from './admin-queue-state';

export function AdminTrajetQueue({ initialQuery = '' }: { initialQuery?: string }) {
  const t = useTranslations('Admin');
  const tRides = useTranslations('Admin.rides');
  const format = useFormatter();
  const [state, setState] = useState<AdminTrajetState>(initialQuery ? 'all' : 'upcoming');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState(initialQuery);
  const [submittedSearch, setSubmittedSearch] = useState(initialQuery);

  const query: AdminTrajetQuery = {
    state,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(submittedSearch ? { q: submittedSearch } : {}),
  };

  const list = useQuery({
    queryKey: ['admin', 'trajets', query],
    queryFn: () => fetchAdminTrajets(query),
    retry: false,
  });

  const rows = list.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <AdminFilterBar>
          <Select value={state} onValueChange={(value) => setState(value as AdminTrajetState)}>
            <SelectTrigger className={ADMIN_FILTER_TRIGGER} aria-label={tRides('state')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AdminTrajetStateSchema.options.map((value) => (
                <SelectItem key={value} value={value}>
                  {tRides(`stateFilter.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label={t('filters.from')} className={cn(ADMIN_FILTER_INPUT, 'w-auto')} />
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label={t('filters.to')} className={cn(ADMIN_FILTER_INPUT, 'w-auto')} />
          <AdminSearch
            value={search}
            onChange={setSearch}
            onSubmit={() => setSubmittedSearch(search.trim())}
            placeholder={tRides('searchPlaceholder')}
            label={t('filters.search')}
          />
      </AdminFilterBar>

      <AdminQueueState
        isLoading={list.isLoading}
        isError={list.isError}
        empty={rows.length === 0}
        loadingLabel={t('loading')}
        errorLabel={t('error')}
        emptyLabel={tRides('empty')}
        retryLabel={t('retry')}
        onRetry={() => void list.refetch()}
      >
        <Card className="gap-0 py-0">
          <CardContent className="divide-y divide-border p-0">
            {rows.map((row) => (
              <article key={row.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">
                    {row.departureCity} → {row.arrivalCity}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {format.dateTime(new Date(row.departureAt), { dateStyle: 'medium', timeStyle: 'short' })}
                    {' · '}
                    {row.driver.name}
                    {' · '}
                    {tRides('seats', { taken: row.seatsTotal - row.seatsAvailable, total: row.seatsTotal })}
                    {' · '}
                    {tRides('bookingsCount', { count: row.bookingCount })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {row.cancelledAt ? <Badge variant="destructive">{tRides('cancelled')}</Badge> : null}
                  <p className="text-sm font-semibold tabular-nums">
                    {format.number(row.pricePerSeat, { style: 'currency', currency: 'CAD' })}
                  </p>
                  <Link href={`/trajet/${row.id}`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
                    {tRides('open')}
                  </Link>
                </div>
              </article>
            ))}
          </CardContent>
        </Card>
      </AdminQueueState>
    </div>
  );
}

