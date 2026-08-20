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

export async function createStripePaymentIntent(input: {
  invoiceId: string;
  bookingId: string;
  invoiceNumber: string;
  amountCents: number;
  currency: string;
}): Promise<{ id: string; clientSecret: string | null }> {
  const intent = await stripe().paymentIntents.create(
    {
      amount: input.amountCents,
      currency: input.currency,
      metadata: {
        invoiceId: input.invoiceId,
        bookingId: input.bookingId,
        invoiceNumber: input.invoiceNumber,
      },
      automatic_payment_methods: { enabled: true },
    },
    { idempotencyKey: stripeIdempotencyKey(input.invoiceId, 'intent') },
  );
  return { id: intent.id, clientSecret: intent.client_secret };
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
  const list = await stripe().paymentIntents.list({ created: { gte: createdGteUnix }, limit: 100 });
  return list.data.map((intent) => ({
    id: intent.id,
    status: intent.status,
    amount: intent.amount,
    currency: intent.currency,
    metadata: (intent.metadata ?? {}) as Record<string, string>,
  }));
}
