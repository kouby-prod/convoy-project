import { createHash, randomUUID } from 'crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
  COMMISSION_CURRENCY,
  InvoiceSchema,
  type Invoice,
} from '@carpool/schemas';
import { user } from '../../db/auth-schema';
import { invoice } from '../../db/payment';
import { env } from '../../env';
import { computeInvoiceAmounts } from './tax';
import { issueLines, postLedger, type DbTx } from './ledger';

const AWAITING_PAYMENT_TTL_MS = 24 * 60 * 60 * 1000;

export function formatInvoiceNumber(seq: number, at = new Date()): string {
  const year = at.getUTCFullYear();
  return `KOU-${year}-${String(seq).padStart(6, '0')}`;
}

async function nextSequenceValue(tx: DbTx, sequence: 'invoice_number_seq' | 'credit_note_number_seq'): Promise<number> {
  const result = await tx.execute(sql.raw(`select nextval('${sequence}') as n`));
  const rows = (result as unknown as { rows?: Array<{ n: string | number }> }).rows ?? [];
  const raw = rows[0]?.n;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Failed to allocate ${sequence}`);
  }
  return parsed;
}

export function resolveBuyerIdentity(
  bookingRow: { firstName: string | null; lastName: string | null; email: string | null },
  account?: { name?: string | null; email?: string | null } | null,
): { buyerName: string; buyerEmail: string } {
  const fromBooking = [bookingRow.firstName, bookingRow.lastName].filter(Boolean).join(' ').trim();
  const buyerName = fromBooking || account?.name?.trim() || 'Passenger';
  const buyerEmail = (bookingRow.email ?? account?.email ?? '').trim();
  return { buyerName, buyerEmail };
}

export function serializeInvoice(row: typeof invoice.$inferSelect): Invoice {
  return InvoiceSchema.parse({
    id: row.id,
    bookingId: row.bookingId,
    number: row.number,
    status: row.status,
    currency: row.currency,
    subtotalCents: row.subtotalCents,
    fareCents: row.fareCents,
    commissionCents: row.commissionCents,
    taxCents: row.taxCents,
    totalCents: row.totalCents,
    taxLines: row.taxLines,
    buyerName: row.buyerName,
    buyerEmail: row.buyerEmail,
    issuedAt: row.issuedAt.toISOString(),
    dueAt: row.dueAt.toISOString(),
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

/**
 * Issue the Kouby invoice in the same transaction as the booking moving to
 * `awaiting_payment`. Card bookings include the ride fare; Interac/cash stay
 * commission-only. Idempotent on bookingId (unique).
 */
export async function issueInvoiceForBooking(
  tx: DbTx,
  bookingRow: {
    id: string;
    paymentMethod?: string | null;
    fareCents?: number | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    passengerId: string;
  },
): Promise<Invoice> {
  const [existing] = await tx.select().from(invoice).where(eq(invoice.bookingId, bookingRow.id));
  if (existing) return serializeInvoice(existing);

  const fareCents = bookingRow.paymentMethod === 'card' ? (bookingRow.fareCents ?? 0) : 0;
  const amounts = computeInvoiceAmounts(fareCents);
  const now = new Date();
  const seq = await nextSequenceValue(tx, 'invoice_number_seq');
  const id = randomUUID();
  const [passenger] = await tx
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, bookingRow.passengerId));
  const { buyerName, buyerEmail } = resolveBuyerIdentity(bookingRow, passenger);

  const [created] = await tx
    .insert(invoice)
    .values({
      id,
      bookingId: bookingRow.id,
      number: formatInvoiceNumber(seq, now),
      status: 'issued',
      currency: COMMISSION_CURRENCY,
      subtotalCents: amounts.subtotalCents,
      fareCents: amounts.fareCents,
      commissionCents: amounts.commissionCents,
      taxCents: amounts.taxCents,
      totalCents: amounts.totalCents,
      taxLines: amounts.taxLines,
      buyerName,
      buyerEmail,
      issuedAt: now,
      dueAt: new Date(now.getTime() + AWAITING_PAYMENT_TTL_MS),
    })
    .returning();
  if (!created) throw new Error('Invoice insert returned no row');

  await postLedger(
    tx,
    created.id,
    `issue:${created.id}`,
    COMMISSION_CURRENCY,
    issueLines(amounts.commissionCents, amounts.fareCents, amounts.taxCents),
  );
  return serializeInvoice(created);
}

export async function voidIssuedInvoiceForBooking(tx: DbTx, bookingId: string): Promise<void> {
  await tx
    .update(invoice)
    .set({ status: 'voided' })
    .where(and(eq(invoice.bookingId, bookingId), eq(invoice.status, 'issued')));
}

export function invoiceSeller() {
  return {
    legalName: env.INVOICE_LEGAL_NAME,
    address: env.INVOICE_ADDRESS,
    gstNumber: env.INVOICE_GST_NUMBER,
    qstNumber: env.INVOICE_QST_NUMBER,
  };
}

export function hashRequest(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

export { AWAITING_PAYMENT_TTL_MS };
