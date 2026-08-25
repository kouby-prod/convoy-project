import { and, eq, gt, lt } from 'drizzle-orm';
import { db } from '../../db/client';
import { invoice, payment, processedEvent } from '../../db/payment';
import { listRecentStripePaymentIntents } from './stripe';
import { isPayPalConfigured, retrievePayPalOrder } from './paypal';
import { settlePaidInvoice } from './settle';
import { recordPaymentIncident } from './incidents';

/**
 * Compare PSP paid objects to the local ledger. Writes incident rows; does
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
        await recordPaymentIncident({
          kind: 'missing_local',
          provider: 'stripe',
          providerPaymentId: intent.id,
          invoiceId,
          detail: { intent },
        });
        mismatches += 1;
      }
      continue;
    }
    if (local.amountCents !== intent.amount || local.currency !== intent.currency) {
      await recordPaymentIncident({
        kind: 'amount_drift',
        provider: 'stripe',
        providerPaymentId: intent.id,
        invoiceId,
        detail: { local: local.amountCents, remote: intent.amount },
      });
      mismatches += 1;
    }
    if (local.status !== 'succeeded' && local.status !== 'refunded') {
      if (invoiceId) {
        await settlePaidInvoice({
          invoiceId,
          provider: 'stripe',
          providerPaymentId: intent.id,
          amountCents: intent.amount,
          currency: intent.currency,
        }).catch((err: unknown) => {
          console.error('[reconcile] status_drift settle failed', err);
        });
      }
      const [again] = await db
        .select()
        .from(payment)
        .where(and(eq(payment.provider, 'stripe'), eq(payment.providerPaymentId, intent.id)));
      if (again && again.status !== 'succeeded' && again.status !== 'refunded') {
        await recordPaymentIncident({
          kind: 'status_drift',
          provider: 'stripe',
          providerPaymentId: intent.id,
          invoiceId,
          detail: { local: again.status },
        });
        mismatches += 1;
      }
    }
  }

  const localPaid = await db
    .select()
    .from(payment)
    .where(and(eq(payment.provider, 'stripe'), eq(payment.status, 'succeeded'), gt(payment.createdAt, since)));

  const remoteIds = new Set(stripeIntents.map((intent) => intent.id));
  for (const row of localPaid) {
    if (!remoteIds.has(row.providerPaymentId) && stripeIntents.length > 0) {
      await recordPaymentIncident({
        kind: 'extra_local',
        provider: 'stripe',
        providerPaymentId: row.providerPaymentId,
        invoiceId: row.invoiceId,
        detail: {},
      });
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
        await recordPaymentIncident({
          kind: 'missing_remote',
          provider: 'paypal',
          providerPaymentId: row.providerPaymentId,
          invoiceId: row.invoiceId,
          detail: {},
        });
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
        await recordPaymentIncident({
          kind: 'amount_drift',
          provider: 'paypal',
          providerPaymentId: row.providerPaymentId,
          invoiceId: row.invoiceId,
          detail: { local: row.amountCents, remote: order.amountCents },
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
    await recordPaymentIncident({
      kind: 'stuck_received',
      provider: row.provider,
      providerPaymentId: row.eventId,
      detail: { rowId: row.id },
    });
    mismatches += 1;
  }

  const issued = await db.select().from(invoice).where(eq(invoice.status, 'issued'));
  for (const inv of issued) {
    const [succeeded] = await db
      .select()
      .from(payment)
      .where(and(eq(payment.invoiceId, inv.id), eq(payment.status, 'succeeded')));
    if (succeeded) {
      await settlePaidInvoice({
        invoiceId: inv.id,
        provider: succeeded.provider as 'stripe' | 'paypal',
        providerPaymentId: succeeded.providerPaymentId,
        amountCents: succeeded.amountCents,
        currency: succeeded.currency,
      }).catch((err: unknown) => {
        console.error('[reconcile] issued+succeeded settle failed', err);
      });
      const [again] = await db.select().from(invoice).where(eq(invoice.id, inv.id));
      if (again?.status === 'issued') {
        await recordPaymentIncident({
          kind: 'invoice_unpaid_with_succeeded_payment',
          provider: succeeded.provider,
          providerPaymentId: succeeded.providerPaymentId,
          invoiceId: inv.id,
          detail: {},
        });
        mismatches += 1;
      }
    }
  }

  if (mismatches > 0) {
    console.error(`[reconcile] ${mismatches} mismatch(es) written`);
  } else {
    console.log('[reconcile] clean');
  }
  return { mismatches };
}
