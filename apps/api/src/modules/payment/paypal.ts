import { env } from '../../env';

const SANDBOX = 'https://api-m.sandbox.paypal.com';
const LIVE = 'https://api-m.paypal.com';

type PayPalToken = { access_token: string; expires_in: number };

let cachedToken: { token: string; expiresAt: number } | undefined;

export function isPayPalConfigured(): boolean {
  return Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
}

function paypalBase(): string {
  return env.PAYPAL_MODE === 'live' ? LIVE : SANDBOX;
}

export function paypalRequestId(invoiceId: string, kind: 'order' | 'capture' | 'refund', extra?: string): string {
  return extra ? `invoice:${invoiceId}:paypal:${kind}:${extra}` : `invoice:${invoiceId}:paypal:${kind}`;
}

async function paypalAccessToken(): Promise<string> {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw new Error('PayPal is not configured');
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }
  const auth = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    throw new Error(`PayPal OAuth failed (${res.status})`);
  }
  const body = (await res.json()) as PayPalToken;
  cachedToken = {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  return cachedToken.token;
}

async function paypalFetch(path: string, init: RequestInit & { requestId?: string }): Promise<Response> {
  const token = await paypalAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json');
  if (init.requestId) headers.set('PayPal-Request-Id', init.requestId);
  return fetch(`${paypalBase()}${path}`, { ...init, headers });
}

function formatPayPalAmount(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}

type PayPalLink = { href: string; rel: string; method?: string };

/**
 * The `rel: "approve"` link out of an order's `links` array — where a buyer
 * who isn't using the JS SDK's popup (i.e. the mobile app, via an in-app
 * browser) is sent to authorize the payment. Absent once an order is no
 * longer approvable (already captured, voided, etc).
 */
function approvalUrlFromLinks(links: PayPalLink[] | undefined): string | null {
  return links?.find((link) => link.rel === 'approve')?.href ?? null;
}

export async function createPayPalOrder(input: {
  invoiceId: string;
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  // Caller-supplied web return/cancel targets (see CreatePaymentSchema) — a
  // web buyer redirected to the full PayPal checkout page (popup blocked, or
  // certain funding sources) lands back on the web app, not the mobile
  // scheme below. Mobile omits these and gets its own deep link.
  returnUrl?: string;
  cancelUrl?: string;
}): Promise<{ id: string; approvalUrl: string | null }> {
  const res = await paypalFetch('/v2/checkout/orders', {
    method: 'POST',
    requestId: paypalRequestId(input.invoiceId, 'order'),
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          invoice_id: input.invoiceNumber,
          custom_id: input.invoiceId,
          amount: {
            currency_code: input.currency.toUpperCase(),
            value: formatPayPalAmount(input.amountCents),
          },
        },
      ],
      // `return_url`/`cancel_url` only matter to a buyer redirected to the
      // full PayPal checkout page rather than the JS SDK's popup (which
      // completes via its own postMessage channel and ignores these) — that
      // full-page redirect can happen on web too (blocked popup, some
      // funding sources), not just the mobile in-app-browser flow, so these
      // must resolve to wherever the caller actually is. `carpool://` (the
      // app's own scheme, see app.json) is only correct for mobile.
      application_context: {
        return_url: input.returnUrl ?? 'carpool://paypal-redirect?result=success',
        cancel_url: input.cancelUrl ?? 'carpool://paypal-redirect?result=cancel',
        user_action: 'PAY_NOW',
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`PayPal create order failed (${res.status})`);
  }
  const body = (await res.json()) as { id: string; links?: PayPalLink[] };
  return { id: body.id, approvalUrl: approvalUrlFromLinks(body.links) };
}

export async function retrievePayPalOrder(orderId: string): Promise<{
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  invoiceId: string | undefined;
  approvalUrl: string | null;
}> {
  const res = await paypalFetch(`/v2/checkout/orders/${orderId}`, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`PayPal retrieve order failed (${res.status})`);
  }
  const body = (await res.json()) as {
    id: string;
    status: string;
    links?: PayPalLink[];
    purchase_units?: Array<{
      custom_id?: string;
      amount?: { currency_code?: string; value?: string };
    }>;
  };
  const unit = body.purchase_units?.[0];
  const value = unit?.amount?.value ?? '0';
  const amountCents = Math.round(Number(value) * 100);
  return {
    id: body.id,
    status: body.status,
    amountCents,
    currency: (unit?.amount?.currency_code ?? 'CAD').toLowerCase(),
    invoiceId: unit?.custom_id,
    approvalUrl: approvalUrlFromLinks(body.links),
  };
}

export async function capturePayPalOrder(orderId: string, invoiceId: string): Promise<{
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  invoiceId: string | undefined;
}> {
  const res = await paypalFetch(`/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    requestId: paypalRequestId(invoiceId, 'capture'),
    body: '{}',
  });
  if (!res.ok && res.status !== 422) {
    throw new Error(`PayPal capture failed (${res.status})`);
  }
  return retrievePayPalOrder(orderId);
}

export async function refundPayPalCapture(
  captureId: string,
  invoiceId: string,
  creditNoteId: string,
  amountCents?: number,
  currency = 'cad',
): Promise<void> {
  const body =
    amountCents !== undefined
      ? JSON.stringify({
          amount: {
            currency_code: currency.toUpperCase(),
            value: (amountCents / 100).toFixed(2),
          },
        })
      : '{}';
  const res = await paypalFetch(`/v2/payments/captures/${captureId}/refund`, {
    method: 'POST',
    requestId: paypalRequestId(invoiceId, 'refund', creditNoteId),
    body,
  });
  if (!res.ok && res.status !== 422) {
    throw new Error(`PayPal refund failed (${res.status})`);
  }
}

export async function getPayPalCaptureId(orderId: string): Promise<string | undefined> {
  const res = await paypalFetch(`/v2/checkout/orders/${orderId}`, { method: 'GET' });
  if (!res.ok) return undefined;
  const body = (await res.json()) as {
    purchase_units?: Array<{
      payments?: { captures?: Array<{ id: string }> };
    }>;
  };
  return body.purchase_units?.[0]?.payments?.captures?.[0]?.id;
}

export async function verifyPayPalWebhook(rawBody: string, headers: {
  transmissionId: string | undefined;
  transmissionTime: string | undefined;
  certUrl: string | undefined;
  authAlgo: string | undefined;
  transmissionSig: string | undefined;
}): Promise<boolean> {
  if (!env.PAYPAL_WEBHOOK_ID) return false;
  const res = await paypalFetch('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: JSON.stringify({
      auth_algo: headers.authAlgo,
      cert_url: headers.certUrl,
      transmission_id: headers.transmissionId,
      transmission_sig: headers.transmissionSig,
      transmission_time: headers.transmissionTime,
      webhook_id: env.PAYPAL_WEBHOOK_ID,
      webhook_event: JSON.parse(rawBody) as unknown,
    }),
  });
  if (!res.ok) return false;
  const body = (await res.json()) as { verification_status?: string };
  return body.verification_status === 'SUCCESS';
}
