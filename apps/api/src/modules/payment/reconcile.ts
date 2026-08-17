import { and, eq, gt, lt } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../../db/client';
import { invoice, payment, processedEvent, reconciliationMismatch } from '../../db/payment';
import { listRecentStripePaymentIntents } from './stripe';
import { isPayPalConfigured, retrievePayPalOrder } from './paypal';
import { settlePaidInvoice } from './settle';

/**
 * Compare PSP paid objects to the local ledger. Writes mismatch rows; does
 * not move money except via the already-idempotent settle path (safe to re-run).
 */
export async function runPaymentReconciliation(): Promise<{ mismatches: number }> {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const sinceUnix = Math.floor(since.getTime() / 1000);
  let mismatches = 0;

  const stripeIntents = await listRecentStripePaymentIntents(sinceUnix).catch((err: unknown) => {
    console.error('[reconcile] stripe list failed', err);
    return [];
  });

  for (const intent of stripeIntents) {
    if (intent.status !== 'succeeded') continue;
    const invoiceId = intent.metadata.invoiceId;
    const [local] = await db
      .select()
      .from(payment)
      .where(and(eq(payment.provider, 'stripe'), eq(payment.providerPaymentId, intent.id)));
    if (!local) {
      if (invoiceId) {
        await settlePaidInvoice({
          invoiceId,
          provider: 'stripe',
          providerPaymentId: intent.id,
          amountCents: intent.amount,
          currency: intent.currency,
        }).catch((err: unknown) => {
          console.error('[reconcile] stripe settle failed', err);
        });
      }
      const [again] = await db
        .select()
        .from(payment)
        .where(and(eq(payment.provider, 'stripe'), eq(payment.providerPaymentId, intent.id)));
      if (!again) {
        await writeMismatch('missing_local', 'stripe', intent.id, invoiceId, { intent });
        mismatches += 1;
      }
      continue;
    }
    if (local.amountCents !== intent.amount || local.currency !== intent.currency) {
      await writeMismatch('amount_drift', 'stripe', intent.id, invoiceId, {
        local: local.amountCents,
        remote: intent.amount,
      });
      mismatches += 1;
    }
    if (local.status !== 'succeeded' && local.status !== 'refunded') {
      await writeMismatch('status_drift', 'stripe', intent.id, invoiceId, { local: local.status });
      mismatches += 1;
    }
  }

  const localPaid = await db
    .select()
    .from(payment)
    .where(and(eq(payment.provider, 'stripe'), eq(payment.status, 'succeeded'), gt(payment.createdAt, since)));

  const remoteIds = new Set(stripeIntents.map((intent) => intent.id));
  for (const row of localPaid) {
    if (!remoteIds.has(row.providerPaymentId) && stripeIntents.length > 0) {
      await writeMismatch('extra_local', 'stripe', row.providerPaymentId, row.invoiceId, {});
      mismatches += 1;
    }
  }

  const localPaypal = await db
    .select()
    .from(payment)
    .where(and(eq(payment.provider, 'paypal'), gt(payment.createdAt, since)));

  if (isPayPalConfigured()) {
    for (const row of localPaypal) {
      const order = await retrievePayPalOrder(row.providerPaymentId).catch((err: unknown) => {
        console.error('[reconcile] paypal retrieve failed', err);
        return null;
      });
      if (!order) {
        await writeMismatch('missing_remote', 'paypal', row.providerPaymentId, row.invoiceId, {});
        mismatches += 1;
        continue;
      }
      if (order.status === 'COMPLETED' && row.status !== 'succeeded' && row.status !== 'refunded') {
        await settlePaidInvoice({
          invoiceId: row.invoiceId,
          provider: 'paypal',
          providerPaymentId: order.id,
          amountCents: order.amountCents,
          currency: order.currency,
        }).catch((err: unknown) => {
          console.error('[reconcile] paypal settle failed', err);
        });
      }
      if (order.amountCents !== row.amountCents || order.currency !== row.currency) {
        await writeMismatch('amount_drift', 'paypal', row.providerPaymentId, row.invoiceId, {
          local: row.amountCents,
          remote: order.amountCents,
        });
        mismatches += 1;
      }
    }
  }

  const stuckCutoff = new Date(Date.now() - 15 * 60 * 1000);
  const stuck = await db
    .select()
    .from(processedEvent)
    .where(and(eq(processedEvent.status, 'received'), lt(processedEvent.createdAt, stuckCutoff)));
  for (const row of stuck) {
    await writeMismatch('stuck_received', row.provider, row.eventId, undefined, { rowId: row.id });
    mismatches += 1;
  }

  const issued = await db.select().from(invoice).where(eq(invoice.status, 'issued'));
  for (const inv of issued) {
    const [succeeded] = await db
      .select()
      .from(payment)
      .where(and(eq(payment.invoiceId, inv.id), eq(payment.status, 'succeeded')));
    if (succeeded) {
      await writeMismatch('invoice_unpaid_with_succeeded_payment', succeeded.provider, succeeded.providerPaymentId, inv.id, {});
      mismatches += 1;
    }
  }

  if (mismatches > 0) {
    console.error(`[reconcile] ${mismatches} mismatch(es) written`);
  } else {
    console.log('[reconcile] clean');
  }
  return { mismatches };
}

async function writeMismatch(
  kind: string,
  provider: string | undefined,
  providerPaymentId: string | undefined,
  invoiceId: string | undefined,
  detail: unknown,
): Promise<void> {
  await db.insert(reconciliationMismatch).values({
    id: randomUUID(),
    kind,
    provider: provider ?? null,
    providerPaymentId: providerPaymentId ?? null,
    invoiceId: invoiceId ?? null,
    detail,
  });
}
