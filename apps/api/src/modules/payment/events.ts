import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { invoice, payment, processedEvent } from '../../db/payment';
import { paymentIntentIdFromStripeDispute, retrieveStripePaymentIntent } from './stripe';
import { retrievePayPalOrder } from './paypal';
import { markPaymentFailed, markPaymentProcessing, settlePaidInvoice } from './settle';
import { freezeDriverPayoutForBooking, unfreezeDriverPayoutForBooking } from './payout';
import { creditPaidBookingAfterLostDispute } from './refund';
import { recordPaymentIncident } from './incidents';

export async function handleStripeEvent(type: string, payload: Record<string, unknown>): Promise<void> {
  const id = typeof payload.id === 'string' ? payload.id : undefined;
  if (type === 'payment_intent.succeeded') {
    if (!id) return;
    const intent = await retrieveStripePaymentIntent(id);
    const invoiceId = intent.metadata.invoiceId;
    if (!invoiceId || intent.status !== 'succeeded') return;
    await settlePaidInvoice({
      invoiceId,
      provider: 'stripe',
      providerPaymentId: intent.id,
      amountCents: intent.amount,
      currency: intent.currency,
    });
    return;
  }
  if (type === 'payment_intent.processing' && id) {
    await markPaymentProcessing({ provider: 'stripe', providerPaymentId: id });
    return;
  }
  if (type === 'payment_intent.requires_action' && id) {
    await markPaymentProcessing({ provider: 'stripe', providerPaymentId: id });
    return;
  }
  if (type === 'payment_intent.payment_failed' && id) {
    await markPaymentFailed({ provider: 'stripe', providerPaymentId: id });
    return;
  }
  if (type === 'charge.dispute.created' || type === 'charge.dispute.closed') {
    await handleStripeDispute(type, payload);
  }
}

async function handleStripeDispute(type: string, payload: Record<string, unknown>): Promise<void> {
  const disputeId = typeof payload.id === 'string' ? payload.id : undefined;
  const status = typeof payload.status === 'string' ? payload.status : undefined;
  const piId = await paymentIntentIdFromStripeDispute(payload);
  if (!piId) {
    await recordPaymentIncident({
      kind: 'dispute_missing_pi',
      provider: 'stripe',
      providerPaymentId: disputeId,
      detail: { status },
    });
    return;
  }

  const [pay] = await db
    .select()
    .from(payment)
    .where(and(eq(payment.provider, 'stripe'), eq(payment.providerPaymentId, piId)));
  if (!pay) {
    await recordPaymentIncident({
      kind: 'dispute_unknown_payment',
      provider: 'stripe',
      providerPaymentId: piId,
      detail: { disputeId, status },
    });
    return;
  }

  const [inv] = await db.select().from(invoice).where(eq(invoice.id, pay.invoiceId));
  const bookingId = inv?.bookingId;

  if (type === 'charge.dispute.created') {
    if (bookingId) await freezeDriverPayoutForBooking(bookingId);
    await recordPaymentIncident({
      kind: 'dispute_open',
      provider: 'stripe',
      providerPaymentId: piId,
      invoiceId: pay.invoiceId,
      detail: { disputeId, status },
    });
    return;
  }

  if (status === 'lost' && bookingId) {
    await creditPaidBookingAfterLostDispute(bookingId);
    await recordPaymentIncident({
      kind: 'dispute_lost',
      provider: 'stripe',
      providerPaymentId: piId,
      invoiceId: pay.invoiceId,
      detail: { disputeId, status },
    });
    return;
  }

  if (status === 'won' && bookingId) {
    await unfreezeDriverPayoutForBooking(bookingId);
  }
}

function paypalOrderIdFromEvent(type: string, resource: Record<string, unknown> | undefined): string | undefined {
  if (!resource) return undefined;
  if (type.startsWith('CHECKOUT.ORDER.') && typeof resource.id === 'string') return resource.id;
  const related = (resource.supplementary_data as { related_ids?: { order_id?: string } } | undefined)?.related_ids
    ?.order_id;
  return typeof related === 'string' ? related : undefined;
}

export async function handlePayPalEvent(type: string, payload: Record<string, unknown>): Promise<void> {
  const resource = payload.resource as Record<string, unknown> | undefined;
  const orderId = paypalOrderIdFromEvent(type, resource);

  if (type === 'CHECKOUT.ORDER.COMPLETED' || type === 'PAYMENT.CAPTURE.COMPLETED') {
    if (!orderId) return;
    const order = await retrievePayPalOrder(orderId);
    if (!order.invoiceId) return;
    if (order.status !== 'COMPLETED' && order.status !== 'APPROVED') return;
    await settlePaidInvoice({
      invoiceId: order.invoiceId,
      provider: 'paypal',
      providerPaymentId: order.id,
      amountCents: order.amountCents,
      currency: order.currency,
    });
    return;
  }

  if (type === 'CHECKOUT.ORDER.DECLINED' && orderId) {
    await markPaymentFailed({ provider: 'paypal', providerPaymentId: orderId });
  }
}

export async function markEventProcessed(rowId: string): Promise<void> {
  await db
    .update(processedEvent)
    .set({ status: 'processed', processedAt: new Date() })
    .where(eq(processedEvent.id, rowId));
}
