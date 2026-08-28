'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import type { AdminStats, DocumentStatus } from '@carpool/schemas';
import { Link } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { signInHref } from '@/lib/auth-urls';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { fetchAdminStats } from '@/lib/admin';
import { isApiError } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { AdminDocumentQueue } from './admin-document-queue';
import { AdminUserTable } from './admin-user-table';
import { AdminTrajetQueue } from './admin-trajet-queue';
import { AdminBookingQueue } from './admin-booking-queue';
import { AdminInvoiceQueue } from './admin-invoice-queue';
import { AdminPayoutQueue } from './admin-payout-queue';
import { AdminIncidentQueue } from './admin-incident-queue';

export type AdminView =
  | 'queue'
  | 'users'
  | 'rides'
  | 'bookings'
  | 'invoices'
  | 'payouts'
  | 'incidents';

type StatusFilter = DocumentStatus | 'any';

export function AdminDashboard() {
  const t = useTranslations('Admin');
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [view, setView] = useState<AdminView>('queue');
  const [queueNonce, setQueueNonce] = useState(0);
  const [queueQuery, setQueueQuery] = useState('');
  const [queueStatus, setQueueStatus] = useState<StatusFilter>('pending');
  const [ridesNonce, setRidesNonce] = useState(0);
  const [ridesQuery, setRidesQuery] = useState('');
  const [bookingsNonce, setBookingsNonce] = useState(0);
  const [bookingsQuery, setBookingsQuery] = useState('');

  const stats = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: fetchAdminStats,
    retry: false,
    enabled: Boolean(session?.user),
  });

  function openDocuments(query: string, status: StatusFilter = 'any') {
    setQueueQuery(query);
    setQueueStatus(status);
    setQueueNonce((value) => value + 1);
    setView('queue');
  }

  function openRides(query: string) {
    setRidesQuery(query);
    setRidesNonce((value) => value + 1);
    setView('rides');
  }

  function openBookings(query: string) {
    setBookingsQuery(query);
    setBookingsNonce((value) => value + 1);
    setView('bookings');
  }

  if (isSessionPending) {
    return <ListSkeleton rows={4} label={t('loading')} />;
  }

  if (!session?.user) {
    return (
      <AccessCard Icon={ShieldCheck} tone="primary" message={t('authRequired')}>
        <Link href={signInHref('/admin')} className={buttonVariants({ variant: 'primary' })}>
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card sm:rounded-lg sm:ring-1 sm:ring-foreground/10 lg:flex-row">
      <AdminRail view={view} onChange={setView} stats={stats.data} />
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-3 sm:p-4">
        {view === 'queue' ? (
          <AdminDocumentQueue key={queueNonce} initialQuery={queueQuery} initialStatus={queueStatus} />
        ) : null}
        {view === 'users' ? (
          <AdminUserTable
            onOpenDocuments={(query) => openDocuments(query)}
            onOpenRides={openRides}
            onOpenBookings={openBookings}
          />
        ) : null}
        {view === 'rides' ? <AdminTrajetQueue key={ridesNonce} initialQuery={ridesQuery} /> : null}
        {view === 'bookings' ? <AdminBookingQueue key={bookingsNonce} initialQuery={bookingsQuery} /> : null}
        {view === 'invoices' ? <AdminInvoiceQueue /> : null}
        {view === 'payouts' ? <AdminPayoutQueue /> : null}
        {view === 'incidents' ? <AdminIncidentQueue /> : null}
      </section>
    </div>
  );
}

function AdminRail({
  view,
  onChange,
  stats,
}: {
  view: AdminView;
  onChange: (view: AdminView) => void;
  stats?: AdminStats;
}) {
  const t = useTranslations('Admin');
  const work: { id: AdminView; label: string; count?: number }[] = [
    { id: 'queue', label: t('tabs.queue'), count: stats?.documents.pending },
    { id: 'bookings', label: t('tabs.bookings'), count: stats?.bookings.awaitingPayment },
    { id: 'invoices', label: t('paymentsSub.invoices'), count: stats?.payments.invoicesIssued },
    { id: 'payouts', label: t('paymentsSub.payouts') },
    { id: 'incidents', label: t('paymentsSub.incidents'), count: stats?.payments.openIncidents },
  ];
  const registry: { id: AdminView; label: string; count?: number }[] = [
    { id: 'rides', label: t('tabs.rides'), count: stats?.rides.upcoming },
    { id: 'users', label: t('tabs.users'), count: stats?.users.total },
  ];

  return (
    <aside className="shrink-0 border-b border-border lg:flex lg:w-56 lg:flex-col lg:border-r lg:border-b-0">
      <h1 className="px-4 py-3 font-display text-lg font-semibold tracking-tight text-foreground">
        {t('title')}
      </h1>
      <nav aria-label={t('tabs.label')} className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible lg:pb-4">
        <p className="hidden px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:block">
          {t('nav.work')}
        </p>
        {work.map((item) => (
          <RailItem key={item.id} {...item} selected={view === item.id} onSelect={onChange} />
        ))}
        <p className="hidden px-2 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:block">
          {t('nav.registry')}
        </p>
        {registry.map((item) => (
          <RailItem key={item.id} {...item} selected={view === item.id} onSelect={onChange} />
        ))}
      </nav>
    </aside>
  );
}

function RailItem({
  id,
  label,
  count,
  selected,
  onSelect,
}: {
  id: AdminView;
  label: string;
  count?: number;
  selected: boolean;
  onSelect: (id: AdminView) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-current={selected ? 'page' : undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-sm outline-none transition-all duration-200',
        'focus-visible:ring-3 focus-visible:ring-ring/30',
        selected
          ? 'bg-primary/15 font-semibold text-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <span>{label}</span>
      {typeof count === 'number' ? (
        <span className="tabular-nums text-xs">{count}</span>
      ) : null}
    </button>
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
