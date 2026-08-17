import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { processedEvent } from '../../db/payment';
import { retrieveStripePaymentIntent } from './stripe';
import { retrievePayPalOrder } from './paypal';
import { markPaymentFailed, markPaymentProcessing, settlePaidInvoice } from './settle';

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
  if (type === 'payment_intent.payment_failed' && id) {
    await markPaymentFailed({ provider: 'stripe', providerPaymentId: id });
    return;
  }
  // Refund webhooks must not roll a paid invoice back — credit notes do that.
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
