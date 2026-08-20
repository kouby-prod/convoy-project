import { randomUUID } from 'crypto';
import { and, eq, inArray, lte } from 'drizzle-orm';
import { DriverPayoutSchema, type DriverPayout } from '@carpool/schemas';
import { db } from '../../db/client';
import { creditNote, driverPayout, invoice } from '../../db/payment';
import { booking } from '../../db/trajet-schema';
import type { DbTx } from './ledger';

const PAYOUT_HOLD_MS = 24 * 60 * 60 * 1000;

export function serializeDriverPayout(row: typeof driverPayout.$inferSelect): DriverPayout {
  return DriverPayoutSchema.parse({
    id: row.id,
    bookingId: row.bookingId,
    driverId: row.driverId,
    amountCents: row.amountCents,
    currency: row.currency,
    status: row.status,
    dueAt: row.dueAt.toISOString(),
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    paidRef: row.paidRef,
    createdAt: row.createdAt.toISOString(),
  });
}

/** Record what Kouby owes the driver after collecting the ride fare on-platform. */
export async function createHeldDriverPayout(
  tx: DbTx,
  input: {
    bookingId: string;
    driverId: string;
    amountCents: number;
    currency: string;
    departureAt: Date;
  },
): Promise<void> {
  if (input.amountCents <= 0) return;
  await tx
    .insert(driverPayout)
    .values({
      id: randomUUID(),
      bookingId: input.bookingId,
      driverId: input.driverId,
      amountCents: input.amountCents,
      currency: input.currency,
      status: 'held',
      dueAt: new Date(input.departureAt.getTime() + PAYOUT_HOLD_MS),
    })
    .onConflictDoNothing({ target: driverPayout.bookingId });
}

export async function cancelDriverPayoutForBooking(tx: DbTx, bookingId: string): Promise<void> {
  await tx
    .update(driverPayout)
    .set({ status: 'cancelled' })
    .where(and(eq(driverPayout.bookingId, bookingId), inArray(driverPayout.status, ['held', 'due'])));
}

/**
 * Promote `held` payouts whose due clock has elapsed. Skip (and cancel) if the
 * booking was cancelled or the invoice was credited.
 */
export async function releaseHeldDriverPayouts(now = new Date()): Promise<number> {
  const held = await db
    .select()
    .from(driverPayout)
    .where(and(eq(driverPayout.status, 'held'), lte(driverPayout.dueAt, now)));

  let released = 0;
  for (const row of held) {
    const [bookingRow] = await db.select().from(booking).where(eq(booking.id, row.bookingId));
    const [inv] = await db.select().from(invoice).where(eq(invoice.bookingId, row.bookingId));
    const [note] = inv
      ? await db.select().from(creditNote).where(eq(creditNote.invoiceId, inv.id))
      : [undefined];

    if (!bookingRow || bookingRow.status === 'cancelled' || note) {
      await db
        .update(driverPayout)
        .set({ status: 'cancelled' })
        .where(and(eq(driverPayout.id, row.id), eq(driverPayout.status, 'held')));
      continue;
    }

    const [updated] = await db
      .update(driverPayout)
      .set({ status: 'due' })
      .where(and(eq(driverPayout.id, row.id), eq(driverPayout.status, 'held')))
      .returning();
    if (updated) released += 1;
  }
  return released;
}

export async function markDriverPayoutPaid(id: string, ref?: string): Promise<DriverPayout | null> {
  const [updated] = await db
    .update(driverPayout)
    .set({
      status: 'paid',
      paidAt: new Date(),
      paidRef: ref?.trim() ? ref.trim() : null,
    })
    .where(and(eq(driverPayout.id, id), inArray(driverPayout.status, ['held', 'due'])))
    .returning();
  return updated ? serializeDriverPayout(updated) : null;
}

export { PAYOUT_HOLD_MS };
