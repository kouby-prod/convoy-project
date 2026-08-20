'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, CheckCircle2, Copy, Loader2, Lock } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js';
import { createApiClient } from '@carpool/api-client';
import type { BookingStatus, CheckoutBookingSummary, Invoice } from '@carpool/schemas';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { Link, useRouter } from '@/i18n/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookingStatusBadge } from '@/components/trajets/booking-status-badge';
import { DueCountdown } from '@/components/paiement/due-countdown';
import { driverFareCents, formatCad, isPastDue, koubyDueCents } from '@/lib/booking-money';
import { cn } from '@/lib/utils';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

const SETTLEMENT_POLL_MS = 1000;
const SETTLEMENT_TIMEOUT_MS = 30_000;

const stripePromise = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

function isPaidInvoice(data: { invoice?: { status: string } | null; payment?: { status: string } | null } | undefined) {
  return data?.invoice?.status === 'paid' || data?.payment?.status === 'succeeded';
}

function formatWhen(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-CA' : 'fr-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function idempotencyKey(invoiceId: string, provider: 'stripe' | 'paypal'): string {
  const storageKey = `kouby:idem:${invoiceId}:${provider}`;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(storageKey, created);
  return created;
}

async function startCheckout(bookingId: string, invoiceId: string, provider: 'stripe' | 'paypal') {
  const res = await api.payments.$post({
    json: { bookingId, provider },
    header: { 'Idempotency-Key': idempotencyKey(invoiceId, provider) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Checkout failed');
  }
  return res.json();
}

function invoiceStatusVariant(status: Invoice['status']) {
  if (status === 'paid') return 'success' as const;
  if (status === 'voided') return 'destructive' as const;
  if (status === 'issued') return 'warning' as const;
  return 'neutral' as const;
}

function stripeDeclineMessage(
  error: { code?: string; decline_code?: string; message?: string },
  t: ReturnType<typeof useTranslations<'Paiement'>>,
): string {
  const code = error.decline_code ?? error.code;
  switch (code) {
    case 'insufficient_funds':
      return t('decline.insufficientFunds');
    case 'expired_card':
      return t('decline.expiredCard');
    case 'incorrect_cvc':
    case 'invalid_cvc':
      return t('decline.incorrectCvc');
    case 'authentication_required':
      return t('decline.authentication');
    case 'card_declined':
    case 'generic_decline':
      return t('decline.generic');
    case 'processing_error':
      return t('decline.processing');
    default:
      return error.message ?? t('stripeError');
  }
}

export function PaiementCheckout({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Paiement');
  const tFacture = useTranslations('Facture');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const locale = useLocale();
  const [settlement, setSettlement] = useState<'idle' | 'polling' | 'stuck'>('idle');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('redirect_status');
    if (status === 'succeeded' || status === 'processing') {
      setSettlement('polling');
    }
  }, []);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['payments', 'by-booking', bookingId],
    enabled: !!session?.user,
    refetchInterval: settlement === 'polling' ? SETTLEMENT_POLL_MS : false,
    queryFn: async () => {
      const res = await api.payments['by-booking'][':bookingId'].$get({ param: { bookingId } });
      if (!res.ok) throw new Error('Failed to load payment');
      return res.json();
    },
  });

  const paid = isPaidInvoice(data);

  useEffect(() => {
    if (paid && settlement !== 'idle') setSettlement('idle');
  }, [paid, settlement]);

  useEffect(() => {
    if (settlement !== 'polling') return;
    const timer = window.setTimeout(() => setSettlement('stuck'), SETTLEMENT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [settlement]);

  const onPaid = useCallback(async () => {
    setSettlement('polling');
    await queryClient.invalidateQueries({ queryKey: ['payments', 'by-booking', bookingId] });
    await queryClient.invalidateQueries({ queryKey: ['me', 'bookings'] });
    await refetch();
  }, [bookingId, queryClient, refetch]);

  if (isSessionPending) return <p className="text-muted-foreground">{t('loading')}</p>;
  if (!session?.user) {
    router.push('/sign-in');
    return <p className="text-muted-foreground">{t('loading')}</p>;
  }
  if (isLoading) return <p className="text-muted-foreground">{t('loading')}</p>;
  if (isError) return <p className="text-destructive">{t('error')}</p>;

  const booking = data?.booking ?? null;
  const invoice = data?.invoice ?? null;
  const payment = data?.payment ?? null;

  if (!invoice) {
    const pendingTotal =
      booking != null ? formatCad(koubyDueCents(booking.paymentMethod, booking.fareCents), locale) : null;
    return (
      <Card>
        <CardContent className="grid gap-4 px-6 pb-6 pt-6">
          {booking ? <TripSummary booking={booking} locale={locale} /> : null}
          <p className="text-sm text-muted-foreground">
            {booking?.status === 'pending' ? t('waitingDriver') : t('empty')}
          </p>
          {booking?.status === 'pending' && pendingTotal ? (
            <p className="text-sm text-foreground">{t('waitingDriverTotal', { total: pendingTotal })}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Link href="/mes-reservations" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              {t('backToBookings')}
            </Link>
            {booking ? (
              <Link href={`/trajet/${booking.trajetId}`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
                {t('viewTrip')}
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  const confirming = settlement !== 'idle' && !paid;
  const failed = payment?.status === 'failed' && !paid && !confirming;
  const windowExpired =
    !paid &&
    !confirming &&
    (invoice.status === 'voided' ||
      booking?.status === 'expired' ||
      (invoice.status === 'issued' && isPastDue(invoice.dueAt)));

  return (
    <div className="grid gap-6">
      {booking ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TripSummary booking={booking} locale={locale} />
          <div className="grid justify-items-end gap-1">
            <CheckoutSteps status={paid ? 'confirmed' : booking.status} />
            {!paid ? <DueCountdown dueAt={invoice.dueAt} /> : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <CardTitle>
              {paid ? t('paidTitle') : confirming ? t('confirmingTitle') : windowExpired ? t('expiredTitle') : t('payTitle')}
            </CardTitle>
            <Badge variant={invoiceStatusVariant(invoice.status)}>{tFacture(`status.${invoice.status}`)}</Badge>
          </CardHeader>
          <CardContent className="grid gap-5 px-6 pb-6 pt-0">
            {paid ? (
              <PaidState booking={booking} invoice={invoice} locale={locale} />
            ) : confirming ? (
              <div className="grid gap-3">
                <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm text-foreground">
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
                  {t('confirming')}
                </p>
                {settlement === 'stuck' ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-fit"
                    onClick={() => {
                      setSettlement('polling');
                      void refetch();
                    }}
                  >
                    {t('confirmingRetry')}
                  </Button>
                ) : null}
              </div>
            ) : windowExpired ? (
              <div className="grid gap-3">
                <p className="text-sm text-muted-foreground">{t('expiredBody')}</p>
                <Link href="/mes-reservations" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-fit')}>
                  {t('backToBookings')}
                </Link>
              </div>
            ) : (
              <div className="grid gap-3">
                {failed ? (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive ring-1 ring-destructive/20">
                    {t('failedBody')}
                  </p>
                ) : null}
                <CheckoutRails bookingId={bookingId} invoice={invoice} onPaid={onPaid} />
              </div>
            )}
          </CardContent>
        </Card>
        <OrderSummary invoice={invoice} booking={booking} locale={locale} paid={paid} />
      </div>
    </div>
  );
}

function PaidState({
  booking,
  invoice,
  locale,
}: {
  booking: CheckoutBookingSummary | null;
  invoice: Invoice;
  locale: string;
}) {
  const t = useTranslations('Paiement');
  const tRide = useTranslations('Trajet');
  const remaining =
    booking && booking.paymentMethod !== 'card' ? driverFareCents(booking.paymentMethod, booking.fareCents) : 0;
  const remainingLabel = remaining > 0 ? formatCad(remaining, locale) : null;
  const [copied, setCopied] = useState(false);

  return (
    <div className="grid gap-3">
      <p className="flex items-start gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-foreground ring-1 ring-success/20">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={2} aria-hidden />
        {invoice.fareCents > 0 ? t('paidBodyCard') : t('paidBodyOffPlatform')}
      </p>
      {remainingLabel && booking ? (
        <div className="grid gap-2 rounded-lg bg-muted/40 px-3 py-3 ring-1 ring-foreground/5">
          <p className="text-sm font-medium text-foreground">{t('remainingFareTitle')}</p>
          <p className="text-xs text-muted-foreground">
            {t('remainingFareBody', {
              amount: remainingLabel,
              method: tRide(`paymentMethods.${booking.paymentMethod}`),
            })}
          </p>
          <p className="font-display text-2xl font-semibold tabular-nums">{remainingLabel}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-fit"
            onClick={() => {
              void navigator.clipboard.writeText(remainingLabel).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              });
            }}
          >
            <Copy aria-hidden />
            {copied ? t('copied') : t('copyAmount')}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Link href="/mes-reservations" className={cn(buttonVariants({ variant: 'primary', size: 'sm' }))}>
          {t('backToBookings')}
        </Link>
        <Link href={`/messages/${invoice.bookingId}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
          {t('openMessages')}
        </Link>
        {booking ? (
          <Link href={`/trajet/${booking.trajetId}`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            {t('viewTrip')}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function TripSummary({ booking, locale }: { booking: CheckoutBookingSummary; locale: string }) {
  const t = useTranslations('Paiement');

  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-blue">{t('tripLabel')}</p>
      <p className="flex min-w-0 flex-wrap items-center gap-x-2 font-display text-lg font-semibold text-foreground">
        <span className="truncate">{booking.trajet.departureCity}</span>
        <ArrowRight className="size-4 shrink-0 text-brand-blue" strokeWidth={2.25} aria-hidden />
        <span className="truncate">{booking.trajet.destinationCity}</span>
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{formatWhen(booking.trajet.departureDateTime, locale)}</span>
        <span>·</span>
        <span>{t('seatsOnTrip', { count: booking.seats })}</span>
        <BookingStatusBadge status={booking.status} />
      </div>
    </div>
  );
}

function CheckoutSteps({ status }: { status: BookingStatus | 'confirmed' }) {
  const t = useTranslations('Paiement');
  const payCurrent = status === 'awaiting_payment';
  const confirmed = status === 'confirmed';

  const steps = [
    { label: t('stepRequest'), done: true, current: status === 'pending' },
    { label: t('stepPay'), done: confirmed, current: payCurrent },
    { label: t('stepConfirmed'), done: confirmed, current: false },
  ];

  return (
    <ol className="flex flex-wrap gap-2 text-xs">
      {steps.map((step, index) => (
        <li
          key={step.label}
          className={cn(
            'rounded-md px-2.5 py-1 ring-1',
            step.done
              ? 'bg-success/10 text-foreground ring-success/20'
              : step.current
                ? 'bg-primary/20 text-foreground ring-primary/30'
                : 'bg-muted text-muted-foreground ring-foreground/5',
          )}
        >
          {index + 1}. {step.label}
        </li>
      ))}
    </ol>
  );
}

function AmountBreakdown({ invoice, locale }: { invoice: Invoice; locale: string }) {
  const t = useTranslations('Facture');
  const rows = [
    ...(invoice.fareCents > 0 ? [{ label: t('fareLine'), cents: invoice.fareCents }] : []),
    { label: t('commissionLine'), cents: invoice.commissionCents },
    ...invoice.taxLines.map((line) => ({ label: line.label, cents: line.amountCents })),
  ];

  return (
    <dl className="grid gap-1.5 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 text-muted-foreground">
          <dt>{row.label}</dt>
          <dd className="tabular-nums text-foreground">{formatCad(row.cents, locale)}</dd>
        </div>
      ))}
      <div className="flex items-center justify-between gap-4 border-t border-border pt-2 font-medium text-foreground">
        <dt>{t('total')}</dt>
        <dd className="tabular-nums">{formatCad(invoice.totalCents, locale)}</dd>
      </div>
    </dl>
  );
}

function OrderSummary({
  invoice,
  booking,
  locale,
  paid,
}: {
  invoice: Invoice;
  booking: CheckoutBookingSummary | null;
  locale: string;
  paid: boolean;
}) {
  const t = useTranslations('Paiement');
  const tFacture = useTranslations('Facture');
  const tRide = useTranslations('Trajet');

  return (
    <Card className="h-fit lg:sticky lg:top-4">
      <CardHeader>
        <CardTitle>{t('summaryTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 px-6 pb-6 pt-0 text-sm">
        {booking ? (
          <p className="text-xs text-muted-foreground">
            {t('methodLabel')}: {tRide(`paymentMethods.${booking.paymentMethod}`)}
          </p>
        ) : null}
        <p className="font-display text-3xl font-semibold tabular-nums text-foreground">
          {formatCad(invoice.totalCents, locale)}
        </p>
        <AmountBreakdown invoice={invoice} locale={locale} />
        <p className="text-xs leading-relaxed text-muted-foreground">
          {invoice.fareCents > 0 ? t('disclaimerCard') : t('disclaimerOffPlatform')}
        </p>
        <DueCountdown dueAt={invoice.dueAt} paid={paid} />
        {paid ? <InvoiceDownloads invoice={invoice} /> : null}
        <Link href="/cgv" className={cn(buttonVariants({ variant: 'link', size: 'sm' }), 'h-auto w-fit px-0')}>
          {t('cgvLink')}
        </Link>
        {paid ? (
          <p className="text-xs text-muted-foreground">
            {tFacture('number')}: {invoice.number}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function InvoiceDownloads({ invoice }: { invoice: Invoice }) {
  const t = useTranslations('Facture');
  const htmlHref = useMemo(() => `${env.NEXT_PUBLIC_API_URL}/invoices/${invoice.id}/html`, [invoice.id]);
  const downloadPdf = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/invoices/${invoice.id}/pdf`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('pdf');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoice.number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={downloadPdf.isPending} onClick={() => downloadPdf.mutate()}>
        {downloadPdf.isPending ? t('downloading') : t('downloadPdf')}
      </Button>
      <a
        href={htmlHref}
        target="_blank"
        rel="noreferrer"
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
      >
        {t('viewHtml')}
      </a>
      {downloadPdf.isError ? <p className="text-sm text-destructive">{t('downloadError')}</p> : null}
    </div>
  );
}

function CheckoutRails({
  bookingId,
  invoice,
  onPaid,
}: {
  bookingId: string;
  invoice: Invoice;
  onPaid: () => Promise<void>;
}) {
  const t = useTranslations('Paiement');
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  const stripeEnabled = Boolean(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY && stripePromise);
  const paypalEnabled = Boolean(env.NEXT_PUBLIC_PAYPAL_CLIENT_ID) && !stripeEnabled;
  const amountLabel = formatCad(invoice.totalCents, locale);

  return (
    <div className="grid gap-6">
      {stripeEnabled ? (
        <StripeSection
          bookingId={bookingId}
          invoice={invoice}
          amountLabel={amountLabel}
          onPaid={onPaid}
          onError={setError}
        />
      ) : null}
      {paypalEnabled ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium text-foreground">{t('paypalTitle')}</p>
          <PayPalScriptProvider
            options={{
              clientId: env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? '',
              currency: invoice.currency.toUpperCase(),
              intent: 'capture',
            }}
          >
            <PayPalButtons
              style={{ layout: 'vertical', label: 'pay' }}
              createOrder={async () => {
                const checkout = await startCheckout(bookingId, invoice.id, 'paypal');
                if (!checkout.orderId) throw new Error(t('paypalMissingOrder'));
                return checkout.orderId;
              }}
              onApprove={async (data) => {
                const res = await api.payments.paypal.capture.$post({ json: { orderId: data.orderID } });
                if (!res.ok) {
                  const body = (await res.json().catch(() => null)) as { error?: string } | null;
                  throw new Error(body?.error ?? t('captureError'));
                }
                await onPaid();
              }}
              onError={() => setError(t('paypalError'))}
            />
          </PayPalScriptProvider>
        </div>
      ) : null}
      {!stripeEnabled && !paypalEnabled ? <p className="text-sm text-muted-foreground">{t('unavailable')}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function StripeSection({
  bookingId,
  invoice,
  amountLabel,
  onPaid,
  onError,
}: {
  bookingId: string;
  invoice: Invoice;
  amountLabel: string;
  onPaid: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations('Paiement');
  const locale = useLocale();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['payments', 'stripe-intent', bookingId, invoice.id],
    queryFn: () => startCheckout(bookingId, invoice.id, 'stripe'),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">{t('stripeLoading')}</p>;
  if (isError || !data?.clientSecret) {
    return <p className="text-sm text-destructive">{t('stripeError')}</p>;
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: data.clientSecret,
        appearance: { theme: 'stripe' },
        locale: locale === 'en' ? 'en-CA' : 'fr-CA',
      }}
    >
      <StripeForm amountLabel={amountLabel} onPaid={onPaid} onError={onError} />
    </Elements>
  );
}

function StripeForm({
  amountLabel,
  onPaid,
  onError,
}: {
  amountLabel: string;
  onPaid: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations('Paiement');
  const stripe = useStripe();
  const elements = useElements();
  const [pending, setPending] = useState(false);
  const [walletsReady, setWalletsReady] = useState(false);

  const confirm = async () => {
    if (!stripe || !elements) return { ok: false as const };
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });
    if (result.error) {
      onError(stripeDeclineMessage(result.error, t));
      return { ok: false as const };
    }
    if (result.paymentIntent?.status === 'succeeded' || result.paymentIntent?.status === 'processing') {
      await onPaid();
      return { ok: true as const };
    }
    return { ok: false as const };
  };

  const submit = async () => {
    if (!stripe || !elements) return;
    setPending(true);
    onError(null);
    await confirm();
    setPending(false);
  };

  return (
    <div className="grid gap-4">
      <ExpressCheckoutElement
        options={{ emailRequired: true }}
        onReady={({ availablePaymentMethods }) => {
          const methods = availablePaymentMethods
            ? Object.values(availablePaymentMethods).some(Boolean)
            : false;
          setWalletsReady(methods);
        }}
        onConfirm={async (event) => {
          onError(null);
          const result = await confirm();
          if (!result.ok) {
            event.paymentFailed({ reason: 'fail' });
          }
        }}
      />
      {walletsReady ? <p className="text-center text-xs text-muted-foreground">{t('orCard')}</p> : null}
      <PaymentElement
        options={{
          wallets: { applePay: 'never', googlePay: 'never' },
          defaultValues: { billingDetails: { address: { country: 'CA' } } },
        }}
      />
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} aria-hidden />
        <span>
          {t('trust')} {t('cardLogos')}.
        </span>
      </p>
      <div className="sticky bottom-0 z-10 -mx-6 border-t border-border bg-card px-6 py-3 lg:static lg:mx-0 lg:border-0 lg:p-0">
        <Button
          type="button"
          disabled={!stripe || pending}
          onClick={() => void submit()}
          className="w-full font-semibold"
        >
          {pending ? t('paying') : t('payCtaAmount', { amount: amountLabel })}
        </Button>
      </div>
    </div>
  );
}
