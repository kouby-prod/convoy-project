import { and, eq } from 'drizzle-orm';
import { booking, trajet } from '../../db/trajet-schema';
import { invoice, payment } from '../../db/payment';
import { voidIssuedInvoiceForBooking, AWAITING_PAYMENT_TTL_MS } from './invoice';
import type { DbTx } from './ledger';

export interface ExpiredUnpaidBooking {
  passengerId: string;
  seats: number;
}

/**
 * Expire `awaiting_payment` bookings whose invoice is past due, unless a
 * payment attempt is currently `processing` (webhook in flight).
 */
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
      if (latest?.status === 'processing') continue;
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

export function heldBookingStatuses(): Array<'pending' | 'awaiting_payment' | 'confirmed'> {
  return ['pending', 'awaiting_payment', 'confirmed'];
}
