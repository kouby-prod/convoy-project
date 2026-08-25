import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../../db/client';
import { invoice, payment } from '../../db/payment';
import { notifyUser, paymentUrl, describeTrip, trajetUrl } from '../trajet/notifications';
import { booking, trajet } from '../../db/trajet-schema';
import { payLines, postLedger } from './ledger';
import { createHeldDriverPayout } from './payout';
import { refundStripePaymentIntent, stripeIdempotencyKey } from './stripe';
import { getPayPalCaptureId, refundPayPalCapture } from './paypal';
import { recordPaymentIncident } from './incidents';

export type SettleInput = {
  invoiceId: string;
  provider: 'stripe' | 'paypal';
  providerPaymentId: string;
  amountCents: number;
  currency: string;
};

export type SettleResult = 'settled' | 'already_paid' | 'rejected';

/**
 * Idempotent money-in. Optimistic `issued → paid` is the mutex: the loser of
 * a Stripe/PayPal race refunds itself after the transaction commits.
 */
export async function settlePaidInvoice(input: SettleInput): Promise<SettleResult> {
  let loser:
    | { provider: 'stripe' | 'paypal'; providerPaymentId: string; invoiceId: string }
    | undefined;

  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(invoice).where(eq(invoice.id, input.invoiceId));
    if (!current) return 'rejected' as const;
    if (
      current.currency.toLowerCase() !== input.currency.toLowerCase() ||
      current.totalCents !== input.amountCents
    ) {
      console.error('[payment] settle amount mismatch', {
        invoiceId: input.invoiceId,
        expected: current.totalCents,
        got: input.amountCents,
      });
      return 'rejected' as const;
    }

    const [paid] = await tx
      .update(invoice)
      .set({ status: 'paid', paidAt: new Date() })
      .where(and(eq(invoice.id, input.invoiceId), eq(invoice.status, 'issued')))
      .returning();

    if (!paid) {
      if (current.status === 'paid') {
        const [winner] = await tx
          .select()
          .from(payment)
          .where(and(eq(payment.invoiceId, input.invoiceId), eq(payment.status, 'succeeded')));
        if (winner && winner.providerPaymentId !== input.providerPaymentId) {
          loser = {
            provider: input.provider,
            providerPaymentId: input.providerPaymentId,
            invoiceId: input.invoiceId,
          };
        } else if (!winner) {
          await upsertPayment(tx, input, 'succeeded');
        }
        return 'already_paid' as const;
      }
      return 'rejected' as const;
    }

    await tx
      .update(booking)
      .set({ status: 'confirmed' })
      .where(and(eq(booking.id, paid.bookingId), eq(booking.status, 'awaiting_payment')));

    await upsertPayment(tx, input, 'succeeded');
    await postLedger(tx, paid.id, `pay:${paid.id}:${input.providerPaymentId}`, paid.currency, payLines(paid.totalCents));

    if (paid.fareCents > 0) {
      const [bookingRow] = await tx.select().from(booking).where(eq(booking.id, paid.bookingId));
      if (bookingRow) {
        const [trip] = await tx.select().from(trajet).where(eq(trajet.id, bookingRow.trajetId));
        if (trip) {
          await createHeldDriverPayout(tx, {
            bookingId: paid.bookingId,
            driverId: trip.driverId,
            amountCents: paid.fareCents,
            currency: paid.currency,
            departureAt: trip.departureAt,
          });
        }
      }
    }
    return 'settled' as const;
  });

  if (loser) {
    const failed = loser;
    await refundLosingAttempt(failed).catch((err: unknown) => {
      console.error('[payment] loser refund failed', err);
      void recordPaymentIncident({
        kind: 'psp_refund_failed',
        provider: failed.provider,
        providerPaymentId: failed.providerPaymentId,
        invoiceId: failed.invoiceId,
        detail: { error: err instanceof Error ? err.message : String(err), reason: 'loser' },
      });
    });
  }

  if (result === 'settled') {
    await notifyBookingPaid(input.invoiceId).catch((err: unknown) => {
      console.error('[payment] paid notification failed', err);
    });
  }

  return result;
}

async function upsertPayment(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: SettleInput,
  status: 'succeeded' | 'failed',
): Promise<void> {
  const [existing] = await tx
    .select()
    .from(payment)
    .where(
      and(eq(payment.provider, input.provider), eq(payment.providerPaymentId, input.providerPaymentId)),
    );
  if (existing) {
    await tx.update(payment).set({ status }).where(eq(payment.id, existing.id));
    return;
  }
  await tx.insert(payment).values({
    id: randomUUID(),
    invoiceId: input.invoiceId,
    provider: input.provider,
    providerPaymentId: input.providerPaymentId,
    amountCents: input.amountCents,
    currency: input.currency,
    status,
  });
}

async function refundLosingAttempt(loser: {
  provider: 'stripe' | 'paypal';
  providerPaymentId: string;
  invoiceId: string;
}): Promise<void> {
  if (loser.provider === 'stripe') {
    await refundStripePaymentIntent(
      loser.providerPaymentId,
      stripeIdempotencyKey(loser.invoiceId, 'refund', `loser:${loser.providerPaymentId}`),
    );
  } else {
    const captureId = await getPayPalCaptureId(loser.providerPaymentId);
    if (captureId) {
      await refundPayPalCapture(captureId, loser.invoiceId, `loser:${loser.providerPaymentId}`);
    }
  }
  await db
    .update(payment)
    .set({ status: 'cancelled' })
    .where(
      and(
        eq(payment.provider, loser.provider),
        eq(payment.providerPaymentId, loser.providerPaymentId),
      ),
    );
}

async function notifyBookingPaid(invoiceId: string): Promise<void> {
  const [inv] = await db.select().from(invoice).where(eq(invoice.id, invoiceId));
  if (!inv) return;
  const [bookingRow] = await db.select().from(booking).where(eq(booking.id, inv.bookingId));
  if (!bookingRow) return;
  const [trip] = await db.select().from(trajet).where(eq(trajet.id, bookingRow.trajetId));
  const tripText = trip ? describeTrip(trip) : 'your trip';
  await notifyUser(
    bookingRow.passengerId,
    'Your Kouby booking is confirmed',
    `Invoice ${inv.number} is paid. Your booking for ${tripText} is confirmed. ${paymentUrl(bookingRow.id)}`,
    {
      type: 'booking_status',
      link: paymentUrl(bookingRow.id),
    },
  );
  if (trip) {
    const passengerName =
      [bookingRow.firstName, bookingRow.lastName].filter(Boolean).join(' ').trim() || 'A passenger';
    await notifyUser(
      trip.driverId,
      'Passenger paid — booking confirmed',
      `${passengerName} paid the Kouby invoice for ${tripText}. The seat is confirmed: ${trajetUrl(trip.id)}`,
      {
        type: 'booking_status',
        link: trajetUrl(trip.id),
      },
    );
  }
}

export async function markPaymentProcessing(input: {
  provider: 'stripe' | 'paypal';
  providerPaymentId: string;
}): Promise<void> {
  const [existing] = await db
    .select()
    .from(payment)
    .where(
      and(eq(payment.provider, input.provider), eq(payment.providerPaymentId, input.providerPaymentId)),
    );
  if (!existing) return;
  if (existing.status === 'succeeded' || existing.status === 'refunded' || existing.status === 'failed') return;
  await db.update(payment).set({ status: 'processing' }).where(eq(payment.id, existing.id));
}

export async function markPaymentFailed(input: {
  provider: 'stripe' | 'paypal';
  providerPaymentId: string;
}): Promise<void> {
  const [existing] = await db
    .select()
    .from(payment)
    .where(
      and(eq(payment.provider, input.provider), eq(payment.providerPaymentId, input.providerPaymentId)),
    );
  if (!existing) return;
  if (existing.status === 'succeeded' || existing.status === 'refunded') return;
  await db.update(payment).set({ status: 'failed' }).where(eq(payment.id, existing.id));
}
