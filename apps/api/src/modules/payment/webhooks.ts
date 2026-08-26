import { randomUUID } from 'crypto';
import type { Context } from 'hono';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { processedEvent } from '../../db/payment';
import { enqueuePaymentEvent } from '../../queue/payment-jobs';
import { constructStripeEvent, isStripeConfigured } from './stripe';
import { isPayPalConfigured, verifyPayPalWebhook } from './paypal';

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505';
}

async function recordEvent(
  provider: 'stripe' | 'paypal',
  eventId: string,
): Promise<{ id: string; alreadyProcessed: boolean }> {
  try {
    const [row] = await db
      .insert(processedEvent)
      .values({
        id: randomUUID(),
        provider,
        eventId,
        status: 'received',
      })
      .returning();
    if (!row) throw new Error('processed_event insert returned no row');
    return { id: row.id, alreadyProcessed: false };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const [existing] = await db
      .select()
      .from(processedEvent)
      .where(and(eq(processedEvent.provider, provider), eq(processedEvent.eventId, eventId)));
    if (!existing) throw err;
    return { id: existing.id, alreadyProcessed: existing.status === 'processed' };
  }
}

export async function stripeWebhookHandler(c: Context): Promise<Response> {
  if (!isStripeConfigured()) return c.json({ error: 'Stripe is not configured' }, 503);
  const raw = await c.req.text();
  const signature = c.req.header('stripe-signature');
  if (!signature) return c.json({ error: 'Missing stripe-signature' }, 400);
  let event: ReturnType<typeof constructStripeEvent>;
  try {
    event = constructStripeEvent(raw, signature);
  } catch {
    return c.json({ error: 'Invalid signature' }, 400);
  }

  let recorded: { id: string; alreadyProcessed: boolean };
  try {
    recorded = await recordEvent('stripe', event.id);
  } catch (err) {
    console.error('[webhooks/stripe] record failed', err);
    return c.json({ error: 'Failed to persist event' }, 500);
  }
  if (recorded.alreadyProcessed) return c.json({ received: true }, 200);

  const object = event.data.object as unknown as Record<string, unknown>;
  try {
    await enqueuePaymentEvent({
      processedEventRowId: recorded.id,
      provider: 'stripe',
      eventId: event.id,
      type: event.type,
      payload: object,
    });
  } catch (err) {
    console.error('[webhooks/stripe] enqueue failed', err);
    return c.json({ error: 'Failed to enqueue event' }, 500);
  }
  return c.json({ received: true }, 200);
}

export async function paypalWebhookHandler(c: Context): Promise<Response> {
  if (!isPayPalConfigured()) return c.json({ error: 'PayPal is not configured' }, 503);
  const raw = await c.req.text();
  const ok = await verifyPayPalWebhook(raw, {
    transmissionId: c.req.header('paypal-transmission-id'),
    transmissionTime: c.req.header('paypal-transmission-time'),
    certUrl: c.req.header('paypal-cert-url'),
    authAlgo: c.req.header('paypal-auth-algo'),
    transmissionSig: c.req.header('paypal-transmission-sig'),
  });
  if (!ok) return c.json({ error: 'Invalid signature' }, 400);

  let parsed: { id?: string; event_type?: string; resource?: Record<string, unknown> };
  try {
    parsed = JSON.parse(raw) as { id?: string; event_type?: string; resource?: Record<string, unknown> };
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }
  if (!parsed.id || !parsed.event_type) return c.json({ error: 'Missing event id' }, 400);

  let recorded: { id: string; alreadyProcessed: boolean };
  try {
    recorded = await recordEvent('paypal', parsed.id);
  } catch (err) {
    console.error('[webhooks/paypal] record failed', err);
    return c.json({ error: 'Failed to persist event' }, 500);
  }
  if (recorded.alreadyProcessed) return c.json({ received: true }, 200);

  try {
    await enqueuePaymentEvent({
      processedEventRowId: recorded.id,
      provider: 'paypal',
      eventId: parsed.id,
      type: parsed.event_type,
      payload: { resource: parsed.resource },
    });
  } catch (err) {
    console.error('[webhooks/paypal] enqueue failed', err);
    return c.json({ error: 'Failed to enqueue event' }, 500);
  }
  return c.json({ received: true }, 200);
}
