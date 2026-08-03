'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { VerificationChip } from '@/components/documents/verification-chip';
import { fetchAdminUsers } from '@/lib/admin';

/**
 * Read-only account list with each driver's document tally.
 *
 * The counts are the reason this view exists: they show at a glance who has sent
 * nothing and who is waiting on a decision, which the queue alone cannot say
 * (a driver with no submissions has no rows in it).
 */
export function AdminUserTable() {
  const t = useTranslations('Admin');
  const format = useFormatter();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: fetchAdminUsers,
    retry: false,
  });

  if (isLoading) return <StatusCard>{t('loading')}</StatusCard>;
  if (isError) return <StatusCard tone="error">{t('error')}</StatusCard>;
  if (!data?.length) return <StatusCard>{t('users.empty')}</StatusCard>;

  return (
    <Card>
      {/* The table scrolls inside the card rather than pushing the page wide. */}
      <CardContent className="overflow-x-auto p-2 pt-2">
        <table className="w-full min-w-160 border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-muted-foreground">
              <th scope="col" className="px-4 py-3">
                {t('users.name')}
              </th>
              <th scope="col" className="px-4 py-3">
                {t('users.role')}
              </th>
              <th scope="col" className="px-4 py-3">
                {t('users.joined')}
              </th>
              <th scope="col" className="px-4 py-3">
                {t('users.verification')}
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                {t('users.documents')}
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                {t('users.pending')}
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                {t('users.approved')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((account) => (
              <tr key={account.id}>
                <td className="px-4 py-3.5">
                  <p className="font-medium text-foreground">{account.name}</p>
                  <p className="text-xs text-muted-foreground">{account.email}</p>
                </td>
                <td className="px-4 py-3.5">
                  <Badge variant={isAdmin(account.role) ? 'primary' : 'neutral'}>
                    {isAdmin(account.role) ? t('users.admin') : t('users.driver')}
                  </Badge>
                </td>
                <td className="px-4 py-3.5 text-muted-foreground">
                  {format.dateTime(new Date(account.createdAt), {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>
                {/* The verdict, which the three tallies to its right cannot
                    give: they count every submission, verification counts only
                    the two required documents. */}
                <td className="px-4 py-3.5">
                  <VerificationChip verification={account.verification} />
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums text-foreground">
                  {account.documentCount}
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums text-foreground">
                  {account.pendingCount}
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums text-foreground">
                  {account.approvedCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/** Roles are stored comma-separated, matching `hasRole` on the API side. */
function isAdmin(role: string | null): boolean {
  return (role ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .includes('admin');
}

function StatusCard({ children, tone }: { children: string; tone?: 'error' }) {
  return (
    <Card>
      <CardContent
        className={
          tone === 'error'
            ? 'p-8 pt-8 text-center text-sm text-destructive'
            : 'p-8 pt-8 text-center text-sm text-muted-foreground'
        }
      >
        {children}
      </CardContent>
    </Card>
  );
}
