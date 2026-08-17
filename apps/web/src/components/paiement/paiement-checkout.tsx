'use client';

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js';
import { createApiClient } from '@carpool/api-client';
import type { Invoice } from '@carpool/schemas';
import { authClient } from '@/lib/auth-client';
import { env } from '@/lib/env';
import { Link, useRouter } from '@/i18n/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const api = createApiClient(env.NEXT_PUBLIC_API_URL);

const stripePromise = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

function money(cents: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale === 'en' ? 'en-CA' : 'fr-CA', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
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

export function PaiementCheckout({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Paiement');
  const tFacture = useTranslations('Facture');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const locale = typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'fr';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['payments', 'by-booking', bookingId],
    enabled: !!session?.user,
    queryFn: async () => {
      const res = await api.payments['by-booking'][':bookingId'].$get({ param: { bookingId } });
      if (!res.ok) throw new Error('Failed to load payment');
      return res.json();
    },
  });

  const onPaid = useCallback(async () => {
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
  if (!data?.invoice) return <p className="text-muted-foreground">{t('empty')}</p>;

  const invoice = data.invoice;
  const paid = invoice.status === 'paid' || data.payment?.status === 'succeeded';

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card>
        <CardHeader>
          <CardTitle>{paid ? t('paidTitle') : t('payTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 px-6 pb-6 pt-0">
          <p className="text-sm text-muted-foreground">{t('amountLabel')}</p>
          <p className="font-display text-3xl font-semibold text-foreground">
            {money(invoice.totalCents, invoice.currency, locale)}
          </p>
          <p className="text-sm text-muted-foreground">{t('statusLabel')}: {tFacture(`status.${invoice.status}`)}</p>
          {paid ? (
            <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-foreground ring-1 ring-success/20">
              {t('paidBody')}
            </p>
          ) : (
            <CheckoutRails bookingId={bookingId} invoice={invoice} onPaid={onPaid} />
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">{t('disclaimer')}</p>
          <Link href="/cgv" className={cn(buttonVariants({ variant: 'link', size: 'sm' }), 'h-auto w-fit px-0')}>
            {t('cgvLink')}
          </Link>
        </CardContent>
      </Card>
      <InvoicePanel invoice={invoice} />
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
  const [error, setError] = useState<string | null>(null);
  const stripeEnabled = Boolean(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY && stripePromise);
  const paypalEnabled = Boolean(env.NEXT_PUBLIC_PAYPAL_CLIENT_ID);

  return (
    <div className="grid gap-6">
      {stripeEnabled ? (
        <StripeSection bookingId={bookingId} invoice={invoice} onPaid={onPaid} onError={setError} />
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
  onPaid,
  onError,
}: {
  bookingId: string;
  invoice: Invoice;
  onPaid: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations('Paiement');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['payments', 'stripe-intent', bookingId, invoice.id],
    queryFn: () => startCheckout(bookingId, invoice.id, 'stripe'),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">{t('stripeLoading')}</p>;
  if (isError || !data?.clientSecret) {
    return <p className="text-sm text-destructive">{t('stripeError')}</p>;
  }

  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium text-foreground">{t('stripeTitle')}</p>
      <Elements
        stripe={stripePromise}
        options={{ clientSecret: data.clientSecret, appearance: { theme: 'stripe' } }}
      >
        <StripeForm onPaid={onPaid} onError={onError} />
      </Elements>
    </div>
  );
}

function StripeForm({
  onPaid,
  onError,
}: {
  onPaid: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations('Paiement');
  const stripe = useStripe();
  const elements = useElements();
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!stripe || !elements) return;
    setPending(true);
    onError(null);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });
    setPending(false);
    if (result.error) {
      onError(result.error.message ?? t('stripeError'));
      return;
    }
    if (result.paymentIntent?.status === 'succeeded' || result.paymentIntent?.status === 'processing') {
      await onPaid();
    }
  };

  return (
    <div className="grid gap-3">
      <PaymentElement />
      <Button type="button" disabled={!stripe || pending} onClick={() => void submit()}>
        {pending ? t('paying') : t('payCta')}
      </Button>
    </div>
  );
}

function InvoicePanel({ invoice }: { invoice: Invoice }) {
  const t = useTranslations('Facture');
  const locale = typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'fr';

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
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 px-6 pb-6 pt-0 text-sm">
        <p>
          <strong className="text-foreground">{t('number')}:</strong> {invoice.number}
        </p>
        <p>
          <strong className="text-foreground">{t('buyer')}:</strong> {invoice.buyerName}
        </p>
        <p>
          <strong className="text-foreground">{t('line')}:</strong> {t('commissionLine')}
        </p>
        <p>
          <strong className="text-foreground">{t('total')}:</strong>{' '}
          {money(invoice.totalCents, invoice.currency, locale)}
        </p>
        <p className="text-xs text-muted-foreground">{t('fareNote')}</p>
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
        </div>
        {downloadPdf.isError ? <p className="text-sm text-destructive">{t('downloadError')}</p> : null}
      </CardContent>
    </Card>
  );
}
