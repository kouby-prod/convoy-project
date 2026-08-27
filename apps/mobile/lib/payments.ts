import * as SecureStore from 'expo-secure-store';
import type { BookingPaymentState, CheckoutResponse, PaymentProvider } from '@carpool/schemas';
import { api } from './api-client';

/** GET /payments/by-booking/:bookingId — invoice, latest payment, credit note and trip summary for one booking. */
export async function fetchPaymentState(bookingId: string): Promise<BookingPaymentState> {
  const res = await api.payments['by-booking'][':bookingId'].$get({ param: { bookingId } });
  if (!res.ok) throw new Error('Failed to load the payment state');
  return res.json();
}

/**
 * A stable key per (invoice, provider) so a retried checkout after a dropped
 * connection doesn't create a second payment attempt server-side — mirrors
 * the web's sessionStorage-backed idempotency key, using SecureStore since
 * it already exists here (see lib/auth-client.ts).
 */
async function idempotencyKey(invoiceId: string, provider: PaymentProvider): Promise<string> {
  const storageKey = `payment-idem-${invoiceId}-${provider}`;
  const existing = await SecureStore.getItemAsync(storageKey);
  if (existing) return existing;
  const created = crypto.randomUUID();
  await SecureStore.setItemAsync(storageKey, created);
  return created;
}

/** POST /payments — starts (or resumes) checkout for one booking's invoice. */
export async function startCheckout(
  bookingId: string,
  invoiceId: string,
  provider: PaymentProvider,
): Promise<CheckoutResponse> {
  const key = await idempotencyKey(invoiceId, provider);
  const res = await api.payments.$post({
    json: { bookingId, provider },
    header: { 'Idempotency-Key': key },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Checkout failed');
  }
  return res.json();
}

/** POST /payments/stripe/confirm — best-effort nudge; the webhook is the real settlement source. */
export async function confirmStripePayment(bookingId: string): Promise<void> {
  const res = await api.payments.stripe.confirm.$post({ json: { bookingId } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Confirm failed');
  }
}

/** POST /payments/paypal/capture — finalizes a PayPal order after the buyer approved it. */
export async function capturePayPalOrder(orderId: string): Promise<void> {
  const res = await api.payments.paypal.capture.$post({ json: { orderId } });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Capture failed');
  }
}

export function isPaidPaymentState(state: BookingPaymentState | undefined): boolean {
  return state?.invoice?.status === 'paid' || state?.payment?.status === 'succeeded';
}
