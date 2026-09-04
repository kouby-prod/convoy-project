import Stripe from 'stripe';
import { env } from '../../env';

let client: Stripe | undefined;

export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

function stripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe is not configured');
  }
  if (!client) {
    client = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return client;
}

export function stripeIdempotencyKey(invoiceId: string, kind: 'intent' | 'refund', extra?: string): string {
  return extra ? `invoice:${invoiceId}:stripe:${kind}:${extra}` : `invoice:${invoiceId}:stripe:${kind}`;
}

type PaymentIntentInput = {
  invoiceId: string;
  bookingId: string;
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  attemptKey?: string;
  customerId?: string;
};

/**
 * PAYMENT_METHOD_TYPES_FALLBACK: explicit methods used in place of
 * `automatic_payment_methods` when a PaymentIntent sets `setup_future_usage`
 * (i.e. whenever we attach a customer to save their card for later charges).
 *
 * Root cause of "No valid payment method types for this Payment Intent":
 * `setup_future_usage: 'off_session'` restricts automatic resolution to
 * methods that support being reused off-session. If the Dashboard's enabled
 * methods for this mode/currency don't include one that supports off-session
 * reuse (most non-card methods don't), Stripe intersects down to an empty
 * set and rejects the PaymentIntent outright — automatic_payment_methods
 * gives no visibility into *why* the list is empty, it just fails.
 *
 * TODO(dashboard, both TEST and LIVE mode): confirm "Cards" is enabled under
 * Settings > Payment methods for the CAD account, then this fallback can be
 * removed (set STRIPE_PAYMENT_METHOD_TYPES="" and delete this constant) so
 * automatic_payment_methods can resolve the full dashboard-configured list
 * again for repeat/off-session charges.
 */
const PAYMENT_METHOD_TYPES_FALLBACK = ['card'];

function assertValidPaymentIntentAmount(amountCents: number, currency: string): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error(
      `Invalid Stripe amount: ${amountCents} (must be a positive integer number of minor currency units)`,
    );
  }
  const normalizedCurrency = currency.toLowerCase();
  if (!env.STRIPE_ALLOWED_CURRENCIES.includes(normalizedCurrency)) {
    throw new Error(
      `Invalid Stripe currency "${currency}": not in the allowed list [${env.STRIPE_ALLOWED_CURRENCIES.join(', ')}]. ` +
        'Set STRIPE_ALLOWED_CURRENCIES to include it once the account is configured to accept it.',
    );
  }
}

function buildPaymentIntentParams(input: PaymentIntentInput): Stripe.PaymentIntentCreateParams {
  const willSaveForFutureUse = Boolean(input.customerId);
  // Stripe does not use `payment_method_types` at face value: with
  // `automatic_payment_methods` enabled it resolves the *actual* offered
  // methods by intersecting the methods enabled in Dashboard Settings >
  // Payment methods (per mode: test vs. live) with this PaymentIntent's
  // currency, amount, capture_method, and setup_future_usage. Any one of
  // those can filter a method out silently; if the intersection is empty,
  // creation fails with "No valid payment method types for this Payment
  // Intent" instead of a per-method reason.
  const paymentMethodTypes =
    env.STRIPE_PAYMENT_METHOD_TYPES.length > 0
      ? env.STRIPE_PAYMENT_METHOD_TYPES
      : willSaveForFutureUse
        ? PAYMENT_METHOD_TYPES_FALLBACK
        : undefined;

  return {
    amount: input.amountCents,
    currency: input.currency,
    metadata: {
      invoiceId: input.invoiceId,
      bookingId: input.bookingId,
      invoiceNumber: input.invoiceNumber,
    },
    ...(paymentMethodTypes
      ? { payment_method_types: paymentMethodTypes }
      : { automatic_payment_methods: { enabled: true } }),
    ...(willSaveForFutureUse
      ? { customer: input.customerId, setup_future_usage: 'off_session' as const }
      : {}),
  };
}

export async function createStripePaymentIntent(
  input: PaymentIntentInput,
): Promise<{ id: string; clientSecret: string | null }> {
  assertValidPaymentIntentAmount(input.amountCents, input.currency);
  const params = buildPaymentIntentParams(input);
  try {
    const intent = await stripe().paymentIntents.create(params, {
      idempotencyKey: stripeIdempotencyKey(input.invoiceId, 'intent', input.attemptKey),
    });
    return { id: intent.id, clientSecret: intent.client_secret };
  } catch (err) {
    if (err instanceof Stripe.errors.StripeInvalidRequestError) {
      // No API keys or customer PII here: metadata is our own internal IDs
      // and `customer` is a Stripe customer ID, not the underlying email/name.
      console.error('[stripe] PaymentIntent creation rejected', {
        stripeCode: err.code,
        stripeMessage: err.message,
        currency: params.currency,
        amount: params.amount,
        capture_method: params.capture_method ?? 'automatic',
        params,
      });
    }
    throw err;
  }
}

export async function retrieveStripePaymentIntent(id: string): Promise<{
  id: string;
  status: string;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
  clientSecret: string | null;
}> {
  const intent = await stripe().paymentIntents.retrieve(id);
  return {
    id: intent.id,
    status: intent.status,
    amount: intent.amount,
    currency: intent.currency,
    metadata: (intent.metadata ?? {}) as Record<string, string>,
    clientSecret: intent.client_secret,
  };
}

export async function cancelStripePaymentIntent(id: string): Promise<void> {
  try {
    await stripe().paymentIntents.cancel(id);
  } catch (err) {
    console.error(`[stripe] cancel ${id} failed`, err);
  }
}

export async function refundStripePaymentIntent(
  paymentIntentId: string,
  idempotencyKey: string,
  amountCents?: number,
): Promise<void> {
  await stripe().refunds.create(
    {
      payment_intent: paymentIntentId,
      ...(amountCents !== undefined ? { amount: amountCents } : {}),
    },
    { idempotencyKey },
  );
}

export function constructStripeEvent(rawBody: string, signature: string): Stripe.Event {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('Stripe webhook secret is not configured');
  }
  return stripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}

export async function paymentIntentIdFromStripeDispute(
  payload: Record<string, unknown>,
): Promise<string | undefined> {
  if (typeof payload.payment_intent === 'string' && payload.payment_intent.startsWith('pi_')) {
    return payload.payment_intent;
  }
  const chargeId = typeof payload.charge === 'string' ? payload.charge : undefined;
  if (!chargeId) return undefined;
  const charge = await stripe().charges.retrieve(chargeId);
  const intent = charge.payment_intent;
  if (typeof intent === 'string') return intent;
  if (intent && typeof intent === 'object' && 'id' in intent) return String(intent.id);
  return undefined;
}

export async function listRecentStripePaymentIntents(createdGteUnix: number): Promise<
  Array<{
    id: string;
    status: string;
    amount: number;
    currency: string;
    metadata: Record<string, string>;
  }>
> {
  if (!isStripeConfigured()) return [];
  const collected: Array<{
    id: string;
    status: string;
    amount: number;
    currency: string;
    metadata: Record<string, string>;
  }> = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const list = await stripe().paymentIntents.list({
      created: { gte: createdGteUnix },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const intent of list.data) {
      collected.push({
        id: intent.id,
        status: intent.status,
        amount: intent.amount,
        currency: intent.currency,
        metadata: (intent.metadata ?? {}) as Record<string, string>,
      });
    }
    if (!list.has_more || list.data.length === 0) break;
    startingAfter = list.data[list.data.length - 1]?.id;
    if (!startingAfter) break;
  }
  return collected;
}

export async function createStripeCustomer(input: {
  email: string;
  name: string;
  userId: string;
}): Promise<string> {
  const customer = await stripe().customers.create({
    email: input.email,
    name: input.name,
    metadata: { userId: input.userId },
  });
  return customer.id;
}

export async function createStripeSetupIntent(customerId: string): Promise<string> {
  const intent = await stripe().setupIntents.create({
    customer: customerId,
    automatic_payment_methods: { enabled: true },
    usage: 'off_session',
  });
  if (!intent.client_secret) throw new Error('Stripe SetupIntent is missing a client secret');
  return intent.client_secret;
}

export async function createStripeCustomerSession(customerId: string): Promise<string | null> {
  try {
    const session = await stripe().customerSessions.create({
      customer: customerId,
      components: {
        payment_element: {
          enabled: true,
          features: { payment_method_redisplay: 'enabled' },
        },
      },
    });
    return session.client_secret;
  } catch (err) {
    console.error('[stripe] customer session failed', err);
    return null;
  }
}

export async function listStripeCardMethods(customerId: string, defaultPaymentMethodId: string | null) {
  const list = await stripe().paymentMethods.list({ customer: customerId, type: 'card' });
  return list.data.map((method) => ({
    id: method.id,
    brand: method.card?.brand ?? 'card',
    last4: method.card?.last4 ?? '••••',
    expMonth: method.card?.exp_month ?? 0,
    expYear: method.card?.exp_year ?? 0,
    isDefault: method.id === defaultPaymentMethodId,
  }));
}

export async function detachStripePaymentMethod(paymentMethodId: string): Promise<void> {
  await stripe().paymentMethods.detach(paymentMethodId);
}

export async function setStripeDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void> {
  await stripe().customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
}
