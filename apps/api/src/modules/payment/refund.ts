import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { creditNote, invoice, payment } from '../../db/payment';
import { fareRefundLines, postLedger, refundLines, type DbTx } from './ledger';
import { cancelDriverPayoutForBooking } from './payout';
import { refundStripePaymentIntent, stripeIdempotencyKey } from './stripe';
import { getPayPalCaptureId, refundPayPalCapture } from './paypal';
import { recordPaymentIncident } from './incidents';

export function formatCreditNoteNumber(seq: number, at = new Date()): string {
  return `CN-${at.getUTCFullYear()}-${String(seq).padStart(6, '0')}`;
}

type RefundKind = 'full' | 'fare' | 'dispute';

/**
 * Refund a paid booking (driver cancel). PSP refund runs first — the credit
 * note is only written after Stripe/PayPal accepts, so the books cannot say
 * refunded while the card is still captured.
 */
export async function refundPaidBooking(bookingId: string, reason: string): Promise<void> {
  await refundPaidBookingInternal(bookingId, reason, 'full', { refundPsp: true });
}

/**
 * Passenger cancel of a confirmed card booking: refund the fare only, keep the
 * 5 CAD commission, and cancel the driver payout. The payment row stays
 * `succeeded` because commission was kept.
 */
export async function refundFareOnlyForBooking(bookingId: string): Promise<void> {
  await refundPaidBookingInternal(
    bookingId,
    'Passenger cancelled — fare refunded, commission kept',
    'fare',
    { refundPsp: true },
  );
}

/**
 * Chargeback lost: Stripe already reversed the charge. Record the credit note
 * and cancel the payout without sending another refund to the PSP.
 */
export async function creditPaidBookingAfterLostDispute(bookingId: string): Promise<void> {
  await refundPaidBookingInternal(bookingId, 'Stripe dispute lost', 'dispute', { refundPsp: false });
}

async function refundPaidBookingInternal(
  bookingId: string,
  reason: string,
  kind: RefundKind,
  opts: { refundPsp: boolean },
): Promise<void> {
  const [inv] = await db.select().from(invoice).where(eq(invoice.bookingId, bookingId));
  if (!inv || inv.status !== 'paid') return;
  if (kind === 'fare' && inv.fareCents <= 0) return;

  const [succeeded] = await db
    .select()
    .from(payment)
    .where(and(eq(payment.invoiceId, inv.id), eq(payment.status, 'succeeded')));

  if (opts.refundPsp && succeeded) {
    try {
      await refundProvider(
        succeeded.provider as 'stripe' | 'paypal',
        succeeded.providerPaymentId,
        inv.id,
        kind,
        kind === 'fare' ? inv.fareCents : undefined,
        inv.currency,
      );
    } catch (err: unknown) {
      await recordPaymentIncident({
        kind: 'psp_refund_failed',
        provider: succeeded.provider,
        providerPaymentId: succeeded.providerPaymentId,
        invoiceId: inv.id,
        detail: { bookingId, error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  }

  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(creditNote).where(eq(creditNote.invoiceId, inv.id));
    if (existing) {
      await cancelDriverPayoutForBooking(tx, bookingId);
      return;
    }

    const amountCents = kind === 'fare' ? inv.fareCents : inv.totalCents;
    const seqResult = await tx.execute(sql.raw(`select nextval('credit_note_number_seq') as n`));
    const rows = (seqResult as unknown as { rows?: Array<{ n: string | number }> }).rows ?? [];
    const raw = rows[0]?.n;
    const seq = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(seq) || seq < 1) throw new Error('Failed to allocate credit note number');

    const [created] = await tx
      .insert(creditNote)
      .values({
        id: randomUUID(),
        invoiceId: inv.id,
        number: formatCreditNoteNumber(seq),
        amountCents,
        currency: inv.currency,
        reason,
      })
      .returning();
    if (!created) throw new Error('Credit note insert returned no row');

    const lines =
      kind === 'fare'
        ? fareRefundLines(inv.fareCents)
        : refundLines(inv.commissionCents, inv.fareCents, inv.taxCents);
    await postLedger(tx, inv.id, `refund:${created.id}`, inv.currency, lines);
    await cancelDriverPayoutForBooking(tx, bookingId);
  });

  if (kind !== 'fare' && succeeded) {
    await db.update(payment).set({ status: 'refunded' }).where(eq(payment.id, succeeded.id));
  }
}

export async function refundProvider(
  provider: 'stripe' | 'paypal',
  providerPaymentId: string,
  invoiceId: string,
  creditNoteId: string,
  amountCents?: number,
  currency = 'cad',
): Promise<void> {
  if (provider === 'stripe') {
    await refundStripePaymentIntent(
      providerPaymentId,
      stripeIdempotencyKey(invoiceId, 'refund', creditNoteId),
      amountCents,
    );
    return;
  }
  const captureId = await getPayPalCaptureId(providerPaymentId);
  if (captureId) {
    await refundPayPalCapture(captureId, invoiceId, creditNoteId, amountCents, currency);
  }
}

/** Used when a passenger cancels an unpaid booking — drop open PSP intents. */
export async function cancelOpenPaymentsForBooking(
  tx: DbTx,
  bookingId: string,
): Promise<Array<{ provider: 'stripe' | 'paypal'; providerPaymentId: string }>> {
  const [inv] = await tx.select().from(invoice).where(eq(invoice.bookingId, bookingId));
  if (!inv) return [];
  const open = await tx.select().from(payment).where(eq(payment.invoiceId, inv.id));
  const cancelled: Array<{ provider: 'stripe' | 'paypal'; providerPaymentId: string }> = [];
  for (const row of open) {
    if (row.status === 'created' || row.status === 'processing') {
      await tx.update(payment).set({ status: 'cancelled' }).where(eq(payment.id, row.id));
      cancelled.push({
        provider: row.provider as 'stripe' | 'paypal',
        providerPaymentId: row.providerPaymentId,
      });
    }
  }
  return cancelled;
}
