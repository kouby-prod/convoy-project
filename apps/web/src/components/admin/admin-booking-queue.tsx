'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import {
  BookingStatusSchema,
  InvoiceStatusSchema,
  RIDE_PAYMENT_METHODS,
  type AdminBookingQuery,
  type BookingStatus,
  type InvoiceStatus,
  type RidePaymentMethod,
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
import { fetchAdminBookings } from '@/lib/admin';
import { cn } from '@/lib/utils';
import { ADMIN_FILTER_INPUT, ADMIN_FILTER_TRIGGER, AdminFilterBar, AdminQueueState, AdminSearch } from './admin-queue-state';

const ANY = 'any';

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function AdminBookingQueue({ initialQuery = '' }: { initialQuery?: string }) {
  const t = useTranslations('Admin');
  const tBookings = useTranslations('Admin.bookings');
  const tPay = useTranslations('Trajet.paymentMethods');
  const tInvoice = useTranslations('Admin.invoices');
  const format = useFormatter();
  const [status, setStatus] = useState<BookingStatus | typeof ANY>(ANY);
  const [paymentMethod, setPaymentMethod] = useState<RidePaymentMethod | typeof ANY>(ANY);
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus | typeof ANY>(ANY);
  const [from, setFrom] = useState(initialQuery ? '' : todayIso);
  const [to, setTo] = useState('');
  const [search, setSearch] = useState(initialQuery);
  const [submittedSearch, setSubmittedSearch] = useState(initialQuery);

  const query: AdminBookingQuery = {
    ...(status === ANY ? {} : { status }),
    ...(paymentMethod === ANY ? {} : { paymentMethod }),
    ...(invoiceStatus === ANY ? {} : { invoiceStatus }),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(submittedSearch ? { q: submittedSearch } : {}),
  };

  const list = useQuery({
    queryKey: ['admin', 'bookings', query],
    queryFn: () => fetchAdminBookings(query),
    retry: false,
  });

  const rows = list.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <AdminFilterBar>
          <Select value={status} onValueChange={(value) => setStatus(value as BookingStatus | typeof ANY)}>
            <SelectTrigger className={ADMIN_FILTER_TRIGGER} aria-label={tBookings('status')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{tBookings('allStatuses')}</SelectItem>
              {BookingStatusSchema.options.map((value) => (
                <SelectItem key={value} value={value}>
                  {tBookings(`statusValue.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={paymentMethod}
            onValueChange={(value) => setPaymentMethod(value as RidePaymentMethod | typeof ANY)}
          >
            <SelectTrigger className={ADMIN_FILTER_TRIGGER} aria-label={tBookings('paymentMethod')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{tBookings('allMethods')}</SelectItem>
              {RIDE_PAYMENT_METHODS.map((value) => (
                <SelectItem key={value} value={value}>
                  {tPay(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={invoiceStatus}
            onValueChange={(value) => setInvoiceStatus(value as InvoiceStatus | typeof ANY)}
          >
            <SelectTrigger className={ADMIN_FILTER_TRIGGER} aria-label={tBookings('invoice')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{tBookings('allInvoices')}</SelectItem>
              {InvoiceStatusSchema.options.map((value) => (
                <SelectItem key={value} value={value}>
                  {tInvoice(`statusValue.${value}`)}
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
            placeholder={tBookings('searchPlaceholder')}
            label={t('filters.search')}
          />
      </AdminFilterBar>

      <AdminQueueState
        isLoading={list.isLoading}
        isError={list.isError}
        empty={rows.length === 0}
        loadingLabel={t('loading')}
        errorLabel={t('error')}
        emptyLabel={tBookings('empty')}
        retryLabel={t('retry')}
        onRetry={() => void list.refetch()}
      >
        <Card className="gap-0 py-0">
          <CardContent className="divide-y divide-border p-0">
            {rows.map((row) => (
              <article key={row.id} className="grid gap-2 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">
                      {row.trajet.departureCity} → {row.trajet.arrivalCity}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {format.dateTime(new Date(row.trajet.departureAt), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                      {' · '}
                      {row.passenger.name} → {row.driver.name}
                      {' · '}
                      {tBookings('seats', { count: row.seats })}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <BookingStatusBadge status={row.status} />
                    <Badge variant="neutral">{tPay(row.paymentMethod)}</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {format.number(row.fareCents / 100, { style: 'currency', currency: 'CAD' })}
                  {' · '}
                  {row.invoice
                    ? tBookings('invoiceLine', {
                        number: row.invoice.number,
                        status: tInvoice(`statusValue.${row.invoice.status}`),
                      })
                    : tBookings('noInvoice')}
                </p>
              </article>
            ))}
          </CardContent>
        </Card>
      </AdminQueueState>
    </div>
  );
}
