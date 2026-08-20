import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { creditNote, invoice, payment } from '../../db/payment';
import { fareRefundLines, postLedger, refundLines, type DbTx } from './ledger';
import { cancelDriverPayoutForBooking } from './payout';
import { refundStripePaymentIntent, stripeIdempotencyKey } from './stripe';
import { getPayPalCaptureId, refundPayPalCapture } from './paypal';

export function formatCreditNoteNumber(seq: number, at = new Date()): string {
  return `CN-${at.getUTCFullYear()}-${String(seq).padStart(6, '0')}`;
}

/**
 * Refund a paid booking (driver cancel). Creates at most one credit note per
 * invoice; PSP refunds use a deterministic idempotency key so retries are safe.
 */
export async function refundPaidBooking(bookingId: string, reason: string): Promise<void> {
  const [inv] = await db.select().from(invoice).where(eq(invoice.bookingId, bookingId));
  if (!inv || inv.status !== 'paid') return;

  const note = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(creditNote).where(eq(creditNote.invoiceId, inv.id));
    if (existing) {
      await cancelDriverPayoutForBooking(tx, bookingId);
      return existing;
    }

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
        amountCents: inv.totalCents,
        currency: inv.currency,
        reason,
      })
      .returning();
    if (!created) throw new Error('Credit note insert returned no row');

    await postLedger(
      tx,
      inv.id,
      `refund:${created.id}`,
      inv.currency,
      refundLines(inv.commissionCents, inv.fareCents, inv.taxCents),
    );
    await cancelDriverPayoutForBooking(tx, bookingId);
    return created;
  });

  const [succeeded] = await db
    .select()
    .from(payment)
    .where(and(eq(payment.invoiceId, inv.id), eq(payment.status, 'succeeded')));

  if (succeeded) {
    await refundProvider(succeeded.provider as 'stripe' | 'paypal', succeeded.providerPaymentId, inv.id, note.id);
    await db.update(payment).set({ status: 'refunded' }).where(eq(payment.id, succeeded.id));
  }
}

/**
 * Passenger cancel of a confirmed card booking: refund the fare only, keep the
 * 5 CAD commission, and cancel the driver payout.
 */
export async function refundFareOnlyForBooking(bookingId: string): Promise<void> {
  const [inv] = await db.select().from(invoice).where(eq(invoice.bookingId, bookingId));
  if (!inv || inv.status !== 'paid' || inv.fareCents <= 0) return;

  const note = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(creditNote).where(eq(creditNote.invoiceId, inv.id));
    if (existing) return existing;

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
        amountCents: inv.fareCents,
        currency: inv.currency,
        reason: 'Passenger cancelled — fare refunded, commission kept',
      })
      .returning();
    if (!created) throw new Error('Credit note insert returned no row');

    await postLedger(tx, inv.id, `refund-fare:${created.id}`, inv.currency, fareRefundLines(inv.fareCents));
    await cancelDriverPayoutForBooking(tx, bookingId);
    return created;
  });

  const [succeeded] = await db
    .select()
    .from(payment)
    .where(and(eq(payment.invoiceId, inv.id), eq(payment.status, 'succeeded')));

  if (succeeded) {
    await refundProvider(
      succeeded.provider as 'stripe' | 'paypal',
      succeeded.providerPaymentId,
      inv.id,
      note.id,
      inv.fareCents,
      inv.currency,
    );
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
