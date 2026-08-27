import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { booking, trajet } from '../../db/trajet-schema';

export type TrajetLocationAccess =
  | { ok: true; isDriver: boolean }
  | { ok: false; status: 403 | 404; error: string };

/** How long before departure sharing may start — no point broadcasting a day in advance. */
const SHARING_OPENS_BEFORE_MS = 2 * 60 * 60 * 1000;
/** Grace period after the estimated arrival before sharing is considered over. */
const SHARING_CLOSES_AFTER_ARRIVAL_MS = 2 * 60 * 60 * 1000;
/** Fallback window length when the trajet has no estimated arrival time. */
const SHARING_CLOSES_AFTER_DEPARTURE_MS = 12 * 60 * 60 * 1000;

function isWithinSharingWindow(departureAt: Date, arrivalAt: Date | null, now: Date): boolean {
  const opensAt = departureAt.getTime() - SHARING_OPENS_BEFORE_MS;
  const closesAt = arrivalAt
    ? arrivalAt.getTime() + SHARING_CLOSES_AFTER_ARRIVAL_MS
    : departureAt.getTime() + SHARING_CLOSES_AFTER_DEPARTURE_MS;
  const nowMs = now.getTime();
  return nowMs >= opensAt && nowMs <= closesAt;
}

/**
 * Who may see (or, if the driver, publish) a trajet's live location: the
 * driver always, and any passenger holding a `confirmed` booking on it —
 * provided the trajet isn't cancelled and "now" falls within its sharing
 * window (from {@link SHARING_OPENS_BEFORE_MS} before departure to a grace
 * period past the estimated arrival, or a flat fallback window when there is
 * no estimated arrival). Unlike the message module's per-booking access
 * check, this is scoped to the whole trajet — the driver shares a single
 * position stream every confirmed passenger of that ride can watch, shared
 * by both the REST routes (modules/tracking/index.ts) and the WebSocket
 * subscribe handshake (realtime/location-ws.ts).
 */
export async function resolveTrajetLocationAccess(
  trajetId: string,
  userId: string,
  now: Date = new Date(),
): Promise<TrajetLocationAccess> {
  const [trajetRow] = await db.select().from(trajet).where(eq(trajet.id, trajetId));
  if (!trajetRow) return { ok: false, status: 404, error: 'Trajet not found' };

  if (trajetRow.cancelledAt) {
    return { ok: false, status: 403, error: 'Trajet is cancelled' };
  }
  if (!isWithinSharingWindow(trajetRow.departureAt, trajetRow.arrivalAt, now)) {
    return { ok: false, status: 403, error: 'Outside the live-sharing window for this trajet' };
  }

  if (userId === trajetRow.driverId) return { ok: true, isDriver: true };

  const [confirmedBooking] = await db
    .select({ id: booking.id })
    .from(booking)
    .where(
      and(
        eq(booking.trajetId, trajetId),
        eq(booking.passengerId, userId),
        eq(booking.status, 'confirmed'),
      ),
    );
  if (!confirmedBooking) {
    return { ok: false, status: 403, error: 'Not authorized for this trajet' };
  }
  return { ok: true, isDriver: false };
}
