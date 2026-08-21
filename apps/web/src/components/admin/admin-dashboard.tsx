'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { fetchAdminStats } from '@/lib/admin';
import { isApiError } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { AdminStatsTiles } from './admin-stats';
import { AdminDocumentQueue } from './admin-document-queue';
import { AdminUserTable } from './admin-user-table';
import { AdminPayoutQueue } from './admin-payout-queue';
import { AdminIncidentQueue } from './admin-incident-queue';

type AdminView = 'queue' | 'users' | 'payouts' | 'incidents';

/**
 * Backoffice root.
 *
 * Authorisation is decided by the API, not guessed in the browser: the stats
 * query is the probe, and a 403 from it means "signed in, but not an admin".
 * A client-side role check would only be cosmetic — every route behind this page
 * enforces the role itself — and it would also be wrong the moment a role
 * changes mid-session.
 */
export function AdminDashboard() {
  const t = useTranslations('Admin');
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [view, setView] = useState<AdminView>('queue');

  const stats = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: fetchAdminStats,
    // A 403 is a verdict, not a hiccup — retrying it just delays the message.
    retry: false,
    enabled: Boolean(session?.user),
  });

  if (isSessionPending) return null;

  if (!session?.user) {
    return (
      <AccessCard Icon={ShieldCheck} tone="primary" message={t('authRequired')}>
        <Link href="/sign-in" className={buttonVariants({ variant: 'primary' })}>
          {t('authCta')}
        </Link>
      </AccessCard>
    );
  }

  if (isApiError(stats.error, 403) || isApiError(stats.error, 401)) {
    return (
      <AccessCard Icon={ShieldAlert} tone="destructive" message={t('forbidden')}>
        <Link href="/" className={buttonVariants({ variant: 'outline' })}>
          {t('backHome')}
        </Link>
      </AccessCard>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {stats.data ? <AdminStatsTiles stats={stats.data} /> : null}

      {/* View switcher — pill tabs, on-system with the navbar links. */}
      <div
        role="tablist"
        aria-label={t('tabs.label')}
        className="flex w-fit gap-1 rounded-full bg-muted p-1"
      >
        {(['queue', 'users', 'payouts', 'incidents'] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            type="button"
            aria-selected={view === tab}
            onClick={() => setView(tab)}
            className={cn(
              'rounded-full px-5 py-2 text-sm font-semibold outline-none transition-all duration-200 focus-visible:ring-3 focus-visible:ring-ring/30',
              view === tab
                ? 'bg-card text-foreground shadow-sm ring-1 ring-foreground/5'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`tabs.${tab}`)}
          </button>
        ))}
      </div>

      {view === 'queue' ? <AdminDocumentQueue /> : null}
      {view === 'users' ? <AdminUserTable /> : null}
      {view === 'payouts' ? <AdminPayoutQueue /> : null}
      {view === 'incidents' ? <AdminIncidentQueue /> : null}
    </div>
  );
}

function AccessCard({
  Icon,
  tone,
  message,
  children,
}: {
  Icon: typeof ShieldCheck;
  tone: 'primary' | 'destructive';
  message: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardContent className="flex flex-col items-center gap-4 p-8 pt-8 text-center">
        <Icon
          className={cn('size-8', tone === 'primary' ? 'text-primary' : 'text-destructive')}
          strokeWidth={2}
          aria-hidden
        />
        <p className="text-sm text-muted-foreground">{message}</p>
        {children}
      </CardContent>
    </Card>
  );
}
