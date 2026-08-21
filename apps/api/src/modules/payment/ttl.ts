import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { booking, trajet } from '../../db/trajet-schema';
import { invoice, payment } from '../../db/payment';
import { voidIssuedInvoiceForBooking, AWAITING_PAYMENT_TTL_MS } from './invoice';
import type { DbTx } from './ledger';

export interface ExpiredUnpaidBooking {
  passengerId: string;
  seats: number;
}

/**
 * Expire `awaiting_payment` bookings whose invoice is past due (5-minute
 * reserve window). Skip a 3-D Secure / webhook attempt that was touched
 * recently so an in-flight challenge is not cut off.
 */
const PROCESSING_GRACE_MS = 10 * 60 * 1000;
export async function expireUnpaidBookings(
  tx: DbTx,
  trajetId: string,
  seatsAvailable: number,
): Promise<{ seatsAvailable: number; expired: ExpiredUnpaidBooking[] }> {
  const now = new Date();
  const candidates = await tx
    .select()
    .from(booking)
    .where(and(eq(booking.trajetId, trajetId), eq(booking.status, 'awaiting_payment')));

  const expired: ExpiredUnpaidBooking[] = [];
  let seats = seatsAvailable;

  for (const row of candidates) {
    const [inv] = await tx.select().from(invoice).where(eq(invoice.bookingId, row.id));
    const dueAt = inv?.dueAt ?? new Date(row.updatedAt.getTime() + AWAITING_PAYMENT_TTL_MS);
    if (dueAt > now) continue;

    if (inv) {
      const attempts = await tx.select().from(payment).where(eq(payment.invoiceId, inv.id));
      const latest = attempts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      if (latest?.status === 'processing') {
        const touched = latest.updatedAt?.getTime() ?? latest.createdAt.getTime();
        if (now.getTime() - touched < PROCESSING_GRACE_MS) continue;
      }
    }

    const [updated] = await tx
      .update(booking)
      .set({ status: 'expired' })
      .where(and(eq(booking.id, row.id), eq(booking.status, 'awaiting_payment')))
      .returning();
    if (!updated) continue;

    await voidIssuedInvoiceForBooking(tx, row.id);
    seats += row.seats;
    expired.push({ passengerId: row.passengerId, seats: row.seats });
  }

  if (expired.length > 0) {
    await tx.update(trajet).set({ seatsAvailable: seats }).where(eq(trajet.id, trajetId));
  }

  return { seatsAvailable: seats, expired };
}

export type ExpiredUnpaidNotice = ExpiredUnpaidBooking & {
  trip: { id: string; departureCity: string; arrivalCity: string; departureAt: Date };
};

/**
 * Sweep every ride that still has an `awaiting_payment` booking. The per-trajet
 * expire above only runs when someone mutates that ride — quiet trips would
 * otherwise hold seats past the invoice due date.
 */
export async function expireAllUnpaidBookings(): Promise<ExpiredUnpaidNotice[]> {
  const open = await db
    .select({
      trajetId: booking.trajetId,
    })
    .from(booking)
    .where(eq(booking.status, 'awaiting_payment'));

  const trajetIds = [...new Set(open.map((row) => row.trajetId))];
  const notices: ExpiredUnpaidNotice[] = [];

  for (const trajetId of trajetIds) {
    let expired: ExpiredUnpaidBooking[] = [];
    let trip: ExpiredUnpaidNotice['trip'] | undefined;

    await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(trajet).where(eq(trajet.id, trajetId)).for('update');
      if (!locked) return;
      trip = {
        id: locked.id,
        departureCity: locked.departureCity,
        arrivalCity: locked.arrivalCity,
        departureAt: locked.departureAt,
      };
      const result = await expireUnpaidBookings(tx, trajetId, locked.seatsAvailable);
      expired = result.expired;
    });

    if (!trip) continue;
    for (const row of expired) {
      notices.push({ ...row, trip });
    }
  }

  return notices;
}

export function heldBookingStatuses(): Array<'pending' | 'awaiting_payment' | 'confirmed'> {
  return ['pending', 'awaiting_payment', 'confirmed'];
}
