'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import {
  InvoiceStatusSchema,
  PaymentStatusSchema,
  type AdminInvoiceQuery,
  type InvoiceStatus,
  type PaymentStatus,
} from '@carpool/schemas';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BookingStatusBadge } from '@/components/trajets/booking-status-badge';
import { fetchAdminInvoices } from '@/lib/admin';
import { cn } from '@/lib/utils';
import { ADMIN_FILTER_INPUT, ADMIN_FILTER_TRIGGER, AdminFilterBar, AdminQueueState, AdminSearch } from './admin-queue-state';

const ANY = 'any';

const INVOICE_BADGE: Record<InvoiceStatus, 'neutral' | 'warning' | 'success' | 'destructive'> = {
  draft: 'neutral',
  issued: 'warning',
  paid: 'success',
  voided: 'destructive',
};

const PAYMENT_BADGE: Record<PaymentStatus, 'neutral' | 'warning' | 'primary' | 'success' | 'destructive'> = {
  created: 'neutral',
  processing: 'primary',
  succeeded: 'success',
  failed: 'destructive',
  cancelled: 'neutral',
  refunded: 'warning',
};

export function AdminInvoiceQueue() {
  const t = useTranslations('Admin');
  const tInvoices = useTranslations('Admin.invoices');
  const format = useFormatter();
  const [status, setStatus] = useState<InvoiceStatus | typeof ANY>('issued');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | typeof ANY>(ANY);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');

  const query: AdminInvoiceQuery = {
    ...(status === ANY ? {} : { status }),
    ...(paymentStatus === ANY ? {} : { paymentStatus }),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(submittedSearch ? { q: submittedSearch } : {}),
  };

  const list = useQuery({
    queryKey: ['admin', 'invoices', query],
    queryFn: () => fetchAdminInvoices(query),
    retry: false,
  });

  const rows = list.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <AdminFilterBar>
          <Select value={status} onValueChange={(value) => setStatus(value as InvoiceStatus | typeof ANY)}>
            <SelectTrigger className={ADMIN_FILTER_TRIGGER} aria-label={tInvoices('status')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{tInvoices('allStatuses')}</SelectItem>
              {InvoiceStatusSchema.options.map((value) => (
                <SelectItem key={value} value={value}>
                  {tInvoices(`statusValue.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={paymentStatus}
            onValueChange={(value) => setPaymentStatus(value as PaymentStatus | typeof ANY)}
          >
            <SelectTrigger className={ADMIN_FILTER_TRIGGER} aria-label={tInvoices('paymentStatus')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{tInvoices('allPayments')}</SelectItem>
              {PaymentStatusSchema.options.map((value) => (
                <SelectItem key={value} value={value}>
                  {tInvoices(`paymentValue.${value}`)}
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
            placeholder={tInvoices('searchPlaceholder')}
            label={t('filters.search')}
          />
      </AdminFilterBar>

      <AdminQueueState
        isLoading={list.isLoading}
        isError={list.isError}
        empty={rows.length === 0}
        loadingLabel={t('loading')}
        errorLabel={t('error')}
        emptyLabel={tInvoices('empty')}
        retryLabel={t('retry')}
        onRetry={() => void list.refetch()}
      >
        <Card className="gap-0 py-0">
          <CardContent className="divide-y divide-border p-0">
            {rows.map((row) => (
              <article key={row.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{row.number}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.buyerName} · {row.buyerEmail}
                    {' · '}
                    {format.dateTime(new Date(row.issuedAt), { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold tabular-nums">
                    {format.number(row.totalCents / 100, {
                      style: 'currency',
                      currency: row.currency.toUpperCase(),
                    })}
                  </p>
                  <Badge variant={INVOICE_BADGE[row.status]}>{tInvoices(`statusValue.${row.status}`)}</Badge>
                  {row.payment ? (
                    <Badge variant={PAYMENT_BADGE[row.payment.status]}>
                      {row.payment.provider} · {tInvoices(`paymentValue.${row.payment.status}`)}
                    </Badge>
                  ) : (
                    <Badge variant="neutral">{tInvoices('noPayment')}</Badge>
                  )}
                  <BookingStatusBadge status={row.booking.status} />
                </div>
              </article>
            ))}
          </CardContent>
        </Card>
      </AdminQueueState>
    </div>
  );
}
