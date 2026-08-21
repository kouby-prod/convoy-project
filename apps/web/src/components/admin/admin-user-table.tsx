'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { VerificationChip } from '@/components/documents/verification-chip';
import { fetchAdminUsers } from '@/lib/admin';
import { cn } from '@/lib/utils';
import { AdminFilterBar, AdminQueueState, AdminSearch } from './admin-queue-state';

export function AdminUserTable({
  onOpenDocuments,
  onOpenRides,
  onOpenBookings,
}: {
  onOpenDocuments: (query: string) => void;
  onOpenRides: (query: string) => void;
  onOpenBookings: (query: string) => void;
}) {
  const t = useTranslations('Admin');
  const format = useFormatter();
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'users', submittedSearch],
    queryFn: () => fetchAdminUsers(submittedSearch ? { q: submittedSearch } : {}),
    retry: false,
  });

  const rows = data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <AdminFilterBar>
        <AdminSearch
          value={search}
          onChange={setSearch}
          onSubmit={() => setSubmittedSearch(search.trim())}
          placeholder={t('filters.searchPlaceholder')}
          label={t('filters.search')}
        />
      </AdminFilterBar>

      <AdminQueueState
        isLoading={isLoading}
        isError={isError}
        empty={!rows.length}
        loadingLabel={t('loading')}
        errorLabel={t('error')}
        emptyLabel={t('users.empty')}
        retryLabel={t('retry')}
        onRetry={() => void refetch()}
      >
        <Card className="gap-0 py-0">
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-180 border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-muted-foreground">
                  <th scope="col" className="px-4 py-2">
                    {t('users.name')}
                  </th>
                  <th scope="col" className="px-4 py-2">
                    {t('users.role')}
                  </th>
                  <th scope="col" className="px-4 py-2">
                    {t('users.joined')}
                  </th>
                  <th scope="col" className="px-4 py-2">
                    {t('users.verification')}
                  </th>
                  <th scope="col" className="px-4 py-2 text-right">
                    {t('users.rides')}
                  </th>
                  <th scope="col" className="px-4 py-2 text-right">
                    {t('users.bookings')}
                  </th>
                  <th scope="col" className="px-4 py-2 text-right">
                    {t('users.pending')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((account) => (
                  <tr key={account.id}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-foreground">{account.name}</p>
                      <p className="text-xs text-muted-foreground">{account.email}</p>
                      <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
                        <button
                          type="button"
                          className={cn(buttonVariants({ variant: 'link', size: 'sm' }), 'h-auto px-0')}
                          onClick={() => onOpenDocuments(account.email)}
                        >
                          {t('users.openDocuments')}
                        </button>
                        <button
                          type="button"
                          className={cn(buttonVariants({ variant: 'link', size: 'sm' }), 'h-auto px-0')}
                          onClick={() => onOpenRides(account.email)}
                        >
                          {t('users.openRides')}
                        </button>
                        <button
                          type="button"
                          className={cn(buttonVariants({ variant: 'link', size: 'sm' }), 'h-auto px-0')}
                          onClick={() => onOpenBookings(account.email)}
                        >
                          {t('users.openBookings')}
                        </button>
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={isAdmin(account.role) ? 'primary' : 'neutral'}>
                        {isAdmin(account.role) ? t('users.admin') : t('users.driver')}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {format.dateTime(new Date(account.createdAt), {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-2.5">
                      <VerificationChip verification={account.verification} />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                      {account.rideCount}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                      {account.bookingCount}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                      {account.pendingCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </AdminQueueState>
    </div>
  );
}

function isAdmin(role: string | null): boolean {
  return (role ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .includes('admin');
}
