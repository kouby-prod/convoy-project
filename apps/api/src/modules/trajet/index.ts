import { OpenAPIHono } from '@hono/zod-openapi';
import {
  and,
  arrayContains,
  asc,
  avg,
  count,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { requireAuth, getAuth, type AuthEnv } from '../../auth';
import { rateLimit } from '../../middleware/rate-limit';
import { db } from '../../db/client';
import { trajet, booking } from '../../db/trajet-schema';
import { review } from '../../db/review';
import { user } from '../../db/auth-schema';
import type { Trajet, TrajetSearchResult, Booking, BookingWithTrajet, DriverProfile } from '@carpool/schemas';
import {
  listTrajetsRoute,
  getTrajetRoute,
  createTrajetRoute,
  updateTrajetRoute,
  cancelTrajetRoute,
  bookTrajetRoute,
  listTrajetBookingsRoute,
  updateBookingStatusRoute,
  cancelBookingRoute,
  myTrajetsRoute,
  myBookingsRoute,
} from './trajet.routes';
import { notifyUser, trajetUrl, trajetSearchUrl, describeTrip, paymentUrl } from './notifications';
import { geocodeAndStoreTrajetLocation } from './geocoding';
import {
  issueInvoiceForBooking,
  voidIssuedInvoiceForBooking,
  refundPaidBooking,
  refundFareOnlyForBooking,
  expireUnpaidBookings,
  cancelOpenPaymentsForBooking,
} from '../payment/booking-hooks';
import { fareCentsFromPrice } from '../payment/tax';
import { cancelStripePaymentIntent } from '../payment/stripe';
import { renderInvoicePdf } from '../payment/pdf';
import { smtpEmailSender } from '../../auth/email';
import type { DbTx } from '../payment/ledger';

/**
 * Trajet module — an `OpenAPIHono` sub-app mounted by app.ts (see
 * apps/api/src/modules/README.md). It is exported as the CHAINED result of
 * `.openapi(...)` so its route types flow into `AppType` (the RPC client and
 * Swagger). Exporting the bare `new OpenAPIHono()` would drop the route types
 * and `api.trajet` would not exist on the typed client.
 */
const app = new OpenAPIHono<AuthEnv>();

/**
 * How long a booking may sit `pending` before the driver's silence expires
 * it and its seats are given back. Product decision: 12 hours.
 */
const PENDING_BOOKING_TTL_MS = 12 * 60 * 60 * 1000;

/** A `pending` booking expired by the TTL sweep — enough to notify its passenger. */
interface ExpiredBooking {
  passengerId: string;
  seats: number;
}

/**
 * Without this, a driver who never responds holds a passenger's seats
 * forever. Called at the top of every trajet/booking-mutating transaction
 * (book, accept/reject, cancel) so a stale `pending` request is expired —
 * and its seats restocked — before the transaction's own logic runs.
 * Returns the trajet's up-to-date `seatsAvailable` (unchanged if nothing was
 * stale, which callers must use instead of their pre-sweep snapshot) plus
 * the list of bookings that got expired, so the caller can notify their
 * passengers once the transaction has committed.
 */
async function expireStalePendingBookings(
  tx: DbTx,
  trajetId: string,
  seatsAvailable: number,
): Promise<{ seatsAvailable: number; expired: ExpiredBooking[] }> {
  const cutoff = new Date(Date.now() - PENDING_BOOKING_TTL_MS);
  const expired = await tx
    .update(booking)
    .set({ status: 'expired' })
    .where(and(eq(booking.trajetId, trajetId), eq(booking.status, 'pending'), lt(booking.createdAt, cutoff)))
    .returning({ passengerId: booking.passengerId, seats: booking.seats });

  if (expired.length === 0) return { seatsAvailable, expired: [] };

  const freedSeats = expired.reduce((sum, row) => sum + row.seats, 0);
  const updatedSeatsAvailable = seatsAvailable + freedSeats;
  await tx.update(trajet).set({ seatsAvailable: updatedSeatsAvailable }).where(eq(trajet.id, trajetId));
  return { seatsAvailable: updatedSeatsAvailable, expired };
}

async function sweepBookingHolds(
  tx: DbTx,
  trajetId: string,
  seatsAvailable: number,
): Promise<{ seatsAvailable: number; expired: ExpiredBooking[] }> {
  const pending = await expireStalePendingBookings(tx, trajetId, seatsAvailable);
  const unpaid = await expireUnpaidBookings(tx, trajetId, pending.seatsAvailable);
  return {
    seatsAvailable: unpaid.seatsAvailable,
    expired: [...pending.expired, ...unpaid.expired],
  };
}

function namesFromAccount(name: string): { firstName: string | null; lastName: string | null } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
  };
}

/** Notifies every expired booking's passenger — best-effort, after the transaction has committed. */
async function notifyExpiredBookings(
  expired: ExpiredBooking[],
  trip: { departureCity: string; arrivalCity: string; departureAt: Date },
): Promise<void> {
  for (const { passengerId } of expired) {
    await notifyUser(
      passengerId,
      'Your Carpool booking request expired',
      `Your request for the trip from ${describeTrip(trip)} expired because the driver didn't respond in time. Seats may still be available: ${trajetSearchUrl()}`,
    );
  }
}

/**
 * Every paginated list here fetches `limit + 1` rows (via `.limit(limit + 1)`
 * on the caller's query) so `hasMore` can be derived from whether that extra
 * row came back — no separate COUNT(*) query needed.
 */
function paginate<Row>(rows: Row[], limit: number): { items: Row[]; hasMore: boolean } {
  const hasMore = rows.length > limit;
  return { items: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

/**
 * Great-circle distance (km) from `(lat, lng)` to each row's departure point,
 * as a SQL expression usable in both `where` (capped by `radiusKm`) and
 * `orderBy` — computed in SQL (not fetched-then-sorted in JS) so pagination
 * stays correct: a page boundary has to be decided by the database, not by
 * re-sorting whatever page it already handed back.
 * `least`/`greatest` guard `acos`'s [-1, 1] domain against floating-point
 * rounding when a point is compared to itself (or somewhere very close).
 */
function departureDistanceKmSql(lat: number, lng: number): SQL<number> {
  return sql<number>`(6371 * acos(least(1, greatest(-1,
    cos(radians(${lat})) * cos(radians(${trajet.departureLat}::double precision)) *
      cos(radians(${trajet.departureLng}::double precision) - radians(${lng})) +
    sin(radians(${lat})) * sin(radians(${trajet.departureLat}::double precision))
  ))))`;
}

/** Same formula as departureDistanceKmSql, applied in JS to an already-fetched row's coordinates (for display only — filtering/sorting always happens in SQL, see above). */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Builds the `DriverProfile` embedded in every `Trajet`/`TrajetSearchResult`.
 * The platform has no vehicle table yet, so licence/vehicle fields are always
 * null — the UI hides them rather than showing invented data.
 */
function buildDriverProfile(
  driverId: string,
  name: string,
  rating: number | null,
  reviewCount: number,
): DriverProfile {
  const [firstName, ...rest] = name.split(' ').filter(Boolean);
  return {
    id: driverId,
    firstName: firstName ?? '',
    lastName: rest.join(' '),
    licenceYears: null,
    carMake: null,
    carModel: null,
    carSeats: null,
    rating,
    reviewCount,
  };
}

/** Single-driver lookup — used wherever only one row's driver is needed. */
async function getDriverProfile(driverId: string): Promise<DriverProfile> {
  const [driverRow] = await db.select({ name: user.name }).from(user).where(eq(user.id, driverId));
  const [ratingRow] = await db
    .select({ averageRating: avg(review.rating), reviewCount: count(review.rating) })
    .from(review)
    .where(and(eq(review.driverId, driverId), eq(review.direction, 'passenger_to_driver')));
  return buildDriverProfile(
    driverId,
    driverRow?.name ?? '',
    ratingRow?.averageRating ? Number(ratingRow.averageRating) : null,
    ratingRow?.reviewCount ?? 0,
  );
}

// Reads are public; creating requires authentication. Adjust to your auth rules
// (e.g. add `requireRole('admin')` from ../../auth for admin-only mutations).
app.use('/trajets', async (c, next) =>
  c.req.method === 'POST' ? requireAuth(c, next) : next(),
);
app.use('/trajets/:id', async (c, next) =>
  c.req.method === 'PATCH' || c.req.method === 'DELETE' ? requireAuth(c, next) : next(),
);
app.use('/trajets/:id/book', requireAuth);

// Abuse-prone endpoints: unauthenticated search is scraping-prone (rate-limit
// by IP); booking is a real state change worth capping per caller even though
// it's authenticated (rate-limit by user id, so it must run after requireAuth
// above has populated the session).
const searchRateLimit = rateLimit<AuthEnv>({ windowSeconds: 60, max: 30 });
const bookRateLimit = rateLimit<AuthEnv>({
  windowSeconds: 60,
  max: 10,
  keyGenerator: (c) => getAuth(c).user.id,
});
app.use('/trajets', async (c, next) => (c.req.method === 'GET' ? searchRateLimit(c, next) : next()));
app.use('/trajets/:id/book', bookRateLimit);
app.use('/trajets/:id/bookings', requireAuth);
app.use('/trajets/:id/bookings/:bookingId', requireAuth);
app.use('/trajets/:id/bookings/:bookingId/cancel', requireAuth);
app.use('/me/trajets', requireAuth);
app.use('/me/bookings', requireAuth);

export const trajetModule = app
  .openapi(listTrajetsRoute, async (c) => {
    const query = c.req.valid('query');
    // A cancelled trajet never shows up in search, but stays reachable by
    // direct link (getTrajetRoute) and in the driver's own history.
    const conditions = [isNull(trajet.cancelledAt)];

    if (query.departureCity) conditions.push(ilike(trajet.departureCity, `%${query.departureCity}%`));
    if (query.destinationCity) conditions.push(ilike(trajet.arrivalCity, `%${query.destinationCity}%`));
    if (query.date) {
      const dayStart = new Date(`${query.date}T00:00:00.000Z`);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      // `time` narrows the range's start (earliest departure that day) rather
      // than requiring an exact match.
      const rangeStart = query.time ? new Date(`${query.date}T${query.time}:00.000Z`) : dayStart;
      conditions.push(gte(trajet.departureAt, rangeStart), lt(trajet.departureAt, dayEnd));
    }
    if (query.minSeats !== undefined) conditions.push(gte(trajet.seatsAvailable, query.minSeats));
    if (query.maxPrice !== undefined) conditions.push(lte(trajet.pricePerSeat, query.maxPrice.toString()));
    if (query.comfort) conditions.push(eq(trajet.comfort, query.comfort));
    if (query.baggageAllowance) {
      conditions.push(ilike(trajet.baggageAllowance, `%${query.baggageAllowance}%`));
    }
    if (query.amenities.length > 0) conditions.push(arrayContains(trajet.amenities, query.amenities));
    if (query.stopPolicy === 'direct') conditions.push(eq(trajet.hasIntermediateStop, false));
    if (query.stopPolicy === 'withStops') conditions.push(eq(trajet.hasIntermediateStop, true));
    if (query.minDriverRating !== undefined) {
      // Drivers with no reviews yet have no row here at all, so they never
      // qualify for a minDriverRating filter — that's the desired behavior.
      // Resolved eagerly (rather than as a lazy subquery) to keep this simple
      // and match the same two-query style as attachDriverRatings below.
      const qualifyingDriverRows = await db
        .select({ driverId: review.driverId })
        .from(review)
        .where(eq(review.direction, 'passenger_to_driver'))
        .groupBy(review.driverId)
        .having(gte(avg(review.rating), query.minDriverRating));
      const qualifyingDriverIds = qualifyingDriverRows.map((r) => r.driverId);
      // A non-matching sentinel keeps `inArray` well-formed when no driver
      // qualifies, instead of special-casing an empty array.
      conditions.push(inArray(trajet.driverId, qualifyingDriverIds.length ? qualifyingDriverIds : ['__none__']));
    }

    // `nearLat`/`nearLng` are validated together (see TrajetSearchQuerySchema's
    // refine) — either both are present or neither is.
    const near =
      query.nearLat !== undefined && query.nearLng !== undefined
        ? { lat: query.nearLat, lng: query.nearLng }
        : undefined;
    if (near) {
      // A trajet whose departure was never successfully geocoded has no
      // distance to compare against `radiusKm` — it can never match.
      conditions.push(isNotNull(trajet.departureLat), isNotNull(trajet.departureLng));
      if (query.radiusKm !== undefined) {
        conditions.push(lte(departureDistanceKmSql(near.lat, near.lng), query.radiusKm));
      }
    }

    const offset = (query.page - 1) * query.limit;
    const orderExprs = near ? [asc(departureDistanceKmSql(near.lat, near.lng))] : [];
    const rows = await db
      .select()
      .from(trajet)
      .where(and(...conditions))
      .orderBy(...orderExprs)
      .limit(query.limit + 1)
      .offset(offset);

    const { items, hasMore } = paginate(rows, query.limit);
    const withMetadata = await attachSearchMetadata(items, near);
    return c.json({ items: withMetadata, page: query.page, limit: query.limit, hasMore }, 200);
  })
  .openapi(getTrajetRoute, async (c) => {
    const { id } = c.req.valid('param');
    const [row] = await db.select().from(trajet).where(eq(trajet.id, id));
    if (!row) return c.json({ error: 'Not found' }, 404);
    const driver = await getDriverProfile(row.driverId);
    return c.json(serialize(row, driver), 200);
  })
  .openapi(createTrajetRoute, async (c) => {
    const { user: authUser } = getAuth(c); // throws if requireAuth did not run (programmer error, not 401)
    const body = c.req.valid('json');
    const [row] = await db
      .insert(trajet)
      .values({
        id: randomUUID(),
        driverId: authUser.id,
        departureCity: body.departureCity,
        arrivalCity: body.destinationCity,
        departureAt: new Date(body.departureDateTime),
        departurePlace: body.departurePlace ?? null,
        arrivalPlace: body.arrivalPlace ?? null,
        arrivalAt: body.arrivalDateTime ? new Date(body.arrivalDateTime) : null,
        seatsTotal: body.seatsTotal,
        seatsAvailable: body.seatsTotal,
        pricePerSeat: body.pricePerSeat.toString(),
        description: body.description ?? null,
        comfort: body.comfort ?? null,
        baggageAllowance: body.baggageAllowance ?? null,
        amenities: body.amenities ?? [],
        paymentMethods: body.paymentMethods,
        hasIntermediateStop: body.hasIntermediateStop ?? false,
      })
      .returning();
    if (!row) throw new Error('Insert returned no row'); // narrows away `undefined`

    // Fire-and-forget: geocoding is a slow, best-effort enrichment (Nominatim
    // rate-limits to ~1 req/sec and this needs two lookups) — a trajet must
    // stay immediately bookable rather than wait on it. Coordinates land a
    // couple of seconds later via a background UPDATE, or never if geocoding
    // fails.
    geocodeAndStoreTrajetLocation(row.id, row.departureCity, row.arrivalCity).catch((err) => {
      console.error(`Failed to geocode trajet ${row.id}`, err);
    });

    const driver = await getDriverProfile(authUser.id);
    return c.json(serialize(row, driver), 201);
  })
  .openapi(updateTrajetRoute, async (c) => {
    const { user } = getAuth(c);
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');

    const result = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(trajet).where(eq(trajet.id, id)).for('update');
      if (!row) return { ok: false as const, status: 404 as const, error: 'Not found' };
      if (row.driverId !== user.id) {
        return { ok: false as const, status: 403 as const, error: 'Not the driver of this trajet' };
      }
      if (row.cancelledAt) {
        return { ok: false as const, status: 400 as const, error: 'Trajet is cancelled' };
      }

      const bookedSeats = row.seatsTotal - row.seatsAvailable;
      const newSeatsTotal = body.seatsTotal ?? row.seatsTotal;
      if (newSeatsTotal < bookedSeats) {
        return {
          ok: false as const,
          status: 400 as const,
          error: 'seatsTotal cannot be less than seats already booked',
        };
      }

      const [updated] = await tx
        .update(trajet)
        .set({
          ...(body.departureCity !== undefined && { departureCity: body.departureCity }),
          ...(body.destinationCity !== undefined && { arrivalCity: body.destinationCity }),
          ...(body.departureDateTime !== undefined && {
            departureAt: new Date(body.departureDateTime),
          }),
          ...(body.seatsTotal !== undefined && {
            seatsTotal: body.seatsTotal,
            seatsAvailable: newSeatsTotal - bookedSeats,
          }),
          ...(body.pricePerSeat !== undefined && { pricePerSeat: body.pricePerSeat.toString() }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.comfort !== undefined && { comfort: body.comfort }),
          ...(body.baggageAllowance !== undefined && { baggageAllowance: body.baggageAllowance }),
          ...(body.departurePlace !== undefined && { departurePlace: body.departurePlace }),
          ...(body.arrivalPlace !== undefined && { arrivalPlace: body.arrivalPlace }),
          ...(body.arrivalDateTime !== undefined && {
            arrivalAt: body.arrivalDateTime ? new Date(body.arrivalDateTime) : null,
          }),
          ...(body.amenities !== undefined && { amenities: body.amenities }),
          ...(body.paymentMethods !== undefined && { paymentMethods: body.paymentMethods }),
          ...(body.hasIntermediateStop !== undefined && { hasIntermediateStop: body.hasIntermediateStop }),
        })
        .where(eq(trajet.id, id))
        .returning();
      if (!updated) throw new Error('Update returned no row');

      return { ok: true as const, trajet: updated };
    });

    if (!result.ok) return c.json({ error: result.error }, result.status);

    // Only re-geocode when a city actually changed — same fire-and-forget
    // reasoning as createTrajetRoute above.
    if (body.departureCity !== undefined || body.destinationCity !== undefined) {
      geocodeAndStoreTrajetLocation(result.trajet.id, result.trajet.departureCity, result.trajet.arrivalCity).catch(
        (err) => {
          console.error(`Failed to re-geocode trajet ${result.trajet.id}`, err);
        },
      );
    }

    const driver = await getDriverProfile(result.trajet.driverId);
    return c.json(serialize(result.trajet, driver), 200);
  })
  .openapi(cancelTrajetRoute, async (c) => {
    const { user } = getAuth(c);
    const { id } = c.req.valid('param');

    const result = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(trajet).where(eq(trajet.id, id)).for('update');
      if (!row) return { ok: false as const, status: 404 as const, error: 'Not found' };
      if (row.driverId !== user.id) {
        return { ok: false as const, status: 403 as const, error: 'Not the driver of this trajet' };
      }
      if (row.cancelledAt) {
        return { ok: false as const, status: 400 as const, error: 'Trajet is already cancelled' };
      }

      const [updated] = await tx
        .update(trajet)
        .set({ cancelledAt: new Date() })
        .where(eq(trajet.id, id))
        .returning();
      if (!updated) throw new Error('Update returned no row');

      // Only active holds need cancelling — `rejected`/`cancelled`/`expired`
      // bookings are already terminal and shouldn't be touched.
      const active = await tx
        .select()
        .from(booking)
        .where(
          and(
            eq(booking.trajetId, id),
            inArray(booking.status, ['pending', 'awaiting_payment', 'confirmed']),
          ),
        );
      const paidIds = active.filter((row) => row.status === 'confirmed').map((row) => row.id);
      const unpaidIds = active.filter((row) => row.status === 'awaiting_payment').map((row) => row.id);

      const cancelledBookings = await tx
        .update(booking)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(booking.trajetId, id),
            inArray(booking.status, ['pending', 'awaiting_payment', 'confirmed']),
          ),
        )
        .returning({ passengerId: booking.passengerId, id: booking.id });

      for (const unpaidId of unpaidIds) {
        await voidIssuedInvoiceForBooking(tx, unpaidId);
      }

      return { ok: true as const, trajet: updated, cancelledBookings, paidIds };
    });

    if (!result.ok) return c.json({ error: result.error }, result.status);
    await Promise.all(
      result.paidIds.map((bookingId) =>
        refundPaidBooking(bookingId, 'Driver cancelled the trip').catch((err: unknown) => {
          console.error(`Failed to refund booking ${bookingId}`, err);
        }),
      ),
    );
    await Promise.all(
      result.cancelledBookings.map(({ passengerId }) =>
        notifyUser(
          passengerId,
          'Your Carpool trip was cancelled',
          `The driver cancelled the trip from ${describeTrip(result.trajet)} you had booked. Search for another ride: ${trajetSearchUrl()}`,
        ),
      ),
    );
    const cancelDriver = await getDriverProfile(result.trajet.driverId);
    return c.json(serialize(result.trajet, cancelDriver), 200);
  })
  .openapi(bookTrajetRoute, async (c) => {
    const { user } = getAuth(c);
    const { id } = c.req.valid('param');
    const { seats, paymentMethod, firstName, lastName, email, phone, message } = c.req.valid('json');

    let expiredBookings: ExpiredBooking[] = [];
    let trip: { departureCity: string; arrivalCity: string; departureAt: Date } | undefined;

    const result = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(trajet).where(eq(trajet.id, id)).for('update');
      if (!row) return { ok: false as const, status: 404 as const, error: 'Not found' };
      trip = row;
      if (row.cancelledAt) {
        return { ok: false as const, status: 400 as const, error: 'This trajet has been cancelled' };
      }
      if (row.driverId === user.id) {
        return { ok: false as const, status: 403 as const, error: 'Cannot book your own trajet' };
      }
      const offered = row.paymentMethods ?? [];
      if (!offered.includes(paymentMethod)) {
        return {
          ok: false as const,
          status: 400 as const,
          error: 'This ride does not accept that payment method',
        };
      }

      const sweep = await sweepBookingHolds(tx, id, row.seatsAvailable);
      expiredBookings = sweep.expired;
      if (sweep.seatsAvailable < seats) {
        return { ok: false as const, status: 400 as const, error: 'Not enough seats available' };
      }

      const fromAccount = namesFromAccount(user.name);
      const [created] = await tx
        .insert(booking)
        .values({
          id: randomUUID(),
          trajetId: id,
          passengerId: user.id,
          seats,
          // Seats are held immediately (below) so a booking always starts
          // `pending` — the driver still has to accept or reject it.
          status: 'pending',
          paymentMethod,
          fareCents: fareCentsFromPrice(row.pricePerSeat, seats),
          firstName: firstName ?? fromAccount.firstName,
          lastName: lastName ?? fromAccount.lastName,
          email: email ?? user.email ?? null,
          phone: phone ?? null,
          message: message ?? null,
        })
        .returning();
      if (!created) throw new Error('Insert returned no row');

      await tx
        .update(trajet)
        .set({ seatsAvailable: sweep.seatsAvailable - seats })
        .where(eq(trajet.id, id));

      return {
        ok: true as const,
        booking: created,
        driverId: row.driverId,
        departureCity: row.departureCity,
        arrivalCity: row.arrivalCity,
        departureAt: row.departureAt,
      };
    });

    // The sweep's writes commit whether or not the booking itself ultimately
    // succeeds, so its passengers must be notified either way.
    if (trip) await notifyExpiredBookings(expiredBookings, trip);

    if (!result.ok) return c.json({ error: result.error }, result.status);
    await notifyUser(
      result.driverId,
      'New booking request on your Carpool trip',
      `A passenger requested ${seats} seat(s) on your trip from ${describeTrip(result)}. ` +
        `Sign in to accept or reject it: ${trajetUrl(id)}`,
    );
    return c.json(serializeBooking(result.booking), 201);
  })
  .openapi(listTrajetBookingsRoute, async (c) => {
    const { user } = getAuth(c);
    const { id } = c.req.valid('param');
    const { page, limit } = c.req.valid('query');

    const [trajetRow] = await db.select().from(trajet).where(eq(trajet.id, id));
    if (!trajetRow) return c.json({ error: 'Trajet not found' }, 404);
    if (trajetRow.driverId !== user.id) {
      return c.json({ error: 'Not the driver of this trajet' }, 403);
    }

    const rows = await db
      .select()
      .from(booking)
      .where(eq(booking.trajetId, id))
      .limit(limit + 1)
      .offset((page - 1) * limit);

    const { items, hasMore } = paginate(rows, limit);
    return c.json({ items: items.map(serializeBooking), page, limit, hasMore }, 200);
  })
  .openapi(updateBookingStatusRoute, async (c) => {
    const { user } = getAuth(c);
    const { id, bookingId } = c.req.valid('param');
    const { status } = c.req.valid('json');

    let expiredBookings: ExpiredBooking[] = [];
    let trip: { departureCity: string; arrivalCity: string; departureAt: Date } | undefined;

    const result = await db.transaction(async (tx) => {
      const [trajetRow] = await tx.select().from(trajet).where(eq(trajet.id, id)).for('update');
      if (!trajetRow) return { ok: false as const, status: 404 as const, error: 'Trajet not found' };
      trip = trajetRow;
      if (trajetRow.driverId !== user.id) {
        return { ok: false as const, status: 403 as const, error: 'Not the driver of this trajet' };
      }

      // Expire this trajet's stale requests first, so a booking the driver
      // is too late to act on is already `expired` by the time it's fetched
      // below (caught by the `!== 'pending'` check just like any other
      // non-pending status), and its seats are freed regardless of whether
      // the driver ever calls this endpoint again.
      const sweep = await sweepBookingHolds(tx, id, trajetRow.seatsAvailable);
      expiredBookings = sweep.expired;

      const [bookingRow] = await tx.select().from(booking).where(eq(booking.id, bookingId));
      if (!bookingRow || bookingRow.trajetId !== id) {
        return { ok: false as const, status: 404 as const, error: 'Booking not found' };
      }
      if (bookingRow.status !== 'pending') {
        return { ok: false as const, status: 400 as const, error: 'Booking is not pending' };
      }

      const nextStatus = status === 'confirmed' ? 'awaiting_payment' : status;
      const [updated] = await tx
        .update(booking)
        .set({ status: nextStatus })
        .where(eq(booking.id, bookingId))
        .returning();
      if (!updated) throw new Error('Update returned no row');

      let issuedInvoice: Awaited<ReturnType<typeof issueInvoiceForBooking>> | undefined;
      // Rejecting frees the seats held when the booking was created; accepting
      // keeps them held (they were never released) and issues the commission invoice.
      if (status === 'rejected') {
        await tx
          .update(trajet)
          .set({ seatsAvailable: sweep.seatsAvailable + bookingRow.seats })
          .where(eq(trajet.id, id));
      } else {
        issuedInvoice = await issueInvoiceForBooking(tx, bookingRow);
      }

      return {
        ok: true as const,
        booking: updated,
        passengerId: bookingRow.passengerId,
        departureCity: trajetRow.departureCity,
        arrivalCity: trajetRow.arrivalCity,
        departureAt: trajetRow.departureAt,
        issuedInvoice,
      };
    });

    if (trip) await notifyExpiredBookings(expiredBookings, trip);

    if (!result.ok) return c.json({ error: result.error }, result.status);
    if (status === 'confirmed') {
      const invoiceNumber = result.issuedInvoice?.number;
      let attachments: Parameters<typeof notifyUser>[3];
      if (smtpEmailSender && result.issuedInvoice) {
        try {
          const pdf = await renderInvoicePdf(result.issuedInvoice);
          attachments = [
            { filename: `${result.issuedInvoice.number}.pdf`, content: pdf, contentType: 'application/pdf' },
          ];
        } catch (err) {
          console.error('[payment] failed to attach invoice PDF', err);
        }
      }
      await notifyUser(
        result.passengerId,
        'Pay Kouby to confirm your booking',
        `The driver accepted your request for the trip from ${describeTrip(result)}. Pay invoice ${invoiceNumber ?? ''} to confirm: ${paymentUrl(result.booking.id)}`,
        attachments,
      );
    } else {
      await notifyUser(
        result.passengerId,
        'Your Carpool booking was rejected',
        `Your booking request for the trip from ${describeTrip(result)} was rejected by the driver. Search for another ride: ${trajetSearchUrl()}`,
      );
    }
    return c.json(serializeBooking(result.booking), 200);
  })
  .openapi(cancelBookingRoute, async (c) => {
    const { user } = getAuth(c);
    const { id, bookingId } = c.req.valid('param');

    let expiredBookings: ExpiredBooking[] = [];
    let trip: { departureCity: string; arrivalCity: string; departureAt: Date } | undefined;

    const result = await db.transaction(async (tx) => {
      const [trajetRow] = await tx.select().from(trajet).where(eq(trajet.id, id)).for('update');
      if (!trajetRow) return { ok: false as const, status: 404 as const, error: 'Trajet not found' };
      trip = trajetRow;

      // See updateBookingStatusRoute above: expiring stale requests here too
      // means a passenger cancelling one no longer double-frees seats the
      // sweep already gave back.
      const sweep = await sweepBookingHolds(tx, id, trajetRow.seatsAvailable);
      expiredBookings = sweep.expired;

      const [bookingRow] = await tx.select().from(booking).where(eq(booking.id, bookingId));
      if (!bookingRow || bookingRow.trajetId !== id) {
        return { ok: false as const, status: 404 as const, error: 'Booking not found' };
      }
      if (bookingRow.passengerId !== user.id) {
        return { ok: false as const, status: 403 as const, error: 'Not your booking' };
      }
      if (
        bookingRow.status !== 'pending' &&
        bookingRow.status !== 'awaiting_payment' &&
        bookingRow.status !== 'confirmed'
      ) {
        return { ok: false as const, status: 400 as const, error: 'Booking cannot be cancelled' };
      }

      const [updated] = await tx
        .update(booking)
        .set({ status: 'cancelled' })
        .where(eq(booking.id, bookingId))
        .returning();
      if (!updated) throw new Error('Update returned no row');

      let openAttempts: Array<{ provider: 'stripe' | 'paypal'; providerPaymentId: string }> = [];
      let refundFare = false;
      if (bookingRow.status === 'awaiting_payment') {
        await voidIssuedInvoiceForBooking(tx, bookingRow.id);
        openAttempts = await cancelOpenPaymentsForBooking(tx, bookingRow.id);
      } else if (bookingRow.status === 'confirmed' && bookingRow.paymentMethod === 'card' && bookingRow.fareCents > 0) {
        refundFare = true;
      }

      // Pending, awaiting_payment and confirmed all hold seats.
      await tx
        .update(trajet)
        .set({ seatsAvailable: sweep.seatsAvailable + bookingRow.seats })
        .where(eq(trajet.id, id));

      return {
        ok: true as const,
        booking: updated,
        driverId: trajetRow.driverId,
        seats: bookingRow.seats,
        departureCity: trajetRow.departureCity,
        arrivalCity: trajetRow.arrivalCity,
        departureAt: trajetRow.departureAt,
        openAttempts,
        refundFare,
      };
    });

    if (trip) await notifyExpiredBookings(expiredBookings, trip);

    if (!result.ok) return c.json({ error: result.error }, result.status);
    for (const attempt of result.openAttempts) {
      if (attempt.provider === 'stripe') {
        void cancelStripePaymentIntent(attempt.providerPaymentId);
      }
    }
    if (result.refundFare) {
      await refundFareOnlyForBooking(result.booking.id).catch((err: unknown) => {
        console.error(`Failed to refund fare for booking ${result.booking.id}`, err);
      });
    }
    await notifyUser(
      result.driverId,
      'A passenger cancelled their Carpool booking',
      `A passenger cancelled their booking of ${result.seats} seat(s) on your trip from ${describeTrip(result)}. The seat(s) are available again.`,
    );
    return c.json(serializeBooking(result.booking), 200);
  })
  .openapi(myTrajetsRoute, async (c) => {
    const { user } = getAuth(c);
    const { page, limit } = c.req.valid('query');
    const rows = await db
      .select()
      .from(trajet)
      .where(eq(trajet.driverId, user.id))
      .limit(limit + 1)
      .offset((page - 1) * limit);

    const { items, hasMore } = paginate(rows, limit);
    // Every row shares the same driver (the caller) — fetch the profile once.
    const driver = await getDriverProfile(user.id);
    return c.json({ items: items.map((row) => serialize(row, driver)), page, limit, hasMore }, 200);
  })
  .openapi(myBookingsRoute, async (c) => {
    const { user } = getAuth(c);
    const { page, limit } = c.req.valid('query');
    const rows = await db
      .select({
        id: booking.id,
        trajetId: booking.trajetId,
        passengerId: booking.passengerId,
        seats: booking.seats,
        status: booking.status,
        paymentMethod: booking.paymentMethod,
        fareCents: booking.fareCents,
        firstName: booking.firstName,
        lastName: booking.lastName,
        email: booking.email,
        phone: booking.phone,
        message: booking.message,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
        departureCity: trajet.departureCity,
        arrivalCity: trajet.arrivalCity,
        departureAt: trajet.departureAt,
        pricePerSeat: trajet.pricePerSeat,
      })
      .from(booking)
      .innerJoin(trajet, eq(booking.trajetId, trajet.id))
      .where(eq(booking.passengerId, user.id))
      .limit(limit + 1)
      .offset((page - 1) * limit);

    const { items, hasMore } = paginate(rows, limit);
    return c.json({ items: items.map(serializeBookingWithTrajet), page, limit, hasMore }, 200);
  });

/**
 * Attaches each row's driver rating summary (from `passenger_to_driver`
 * reviews, via a single grouped query keyed on the page's distinct driver
 * ids rather than one rating query per row) and, when `near` was part of
 * the search, its distance from that point — recomputed here in JS from the
 * row's own coordinates rather than selected from SQL, since it's only
 * needed for display (filtering/ordering by distance already happened in
 * SQL before this page was fetched).
 */
async function attachSearchMetadata(
  rows: (typeof trajet.$inferSelect)[],
  near: { lat: number; lng: number } | undefined,
): Promise<TrajetSearchResult[]> {
  const driverIds = [...new Set(rows.map((row) => row.driverId))];
  const [ratingRows, nameRows] = await Promise.all([
    driverIds.length
      ? db
          .select({
            driverId: review.driverId,
            averageRating: avg(review.rating),
            reviewCount: count(review.rating),
          })
          .from(review)
          .where(and(inArray(review.driverId, driverIds), eq(review.direction, 'passenger_to_driver')))
          .groupBy(review.driverId)
      : Promise.resolve([]),
    driverIds.length
      ? db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, driverIds))
      : Promise.resolve([]),
  ]);
  const ratingByDriver = new Map(
    ratingRows.map((r) => [
      r.driverId,
      { averageRating: r.averageRating ? Number(r.averageRating) : null, reviewCount: r.reviewCount },
    ]),
  );
  const nameByDriver = new Map(nameRows.map((r) => [r.id, r.name]));

  return rows.map((row) => {
    const rating = ratingByDriver.get(row.driverId);
    const distanceKm =
      near && row.departureLat !== null && row.departureLng !== null
        ? haversineKm(near.lat, near.lng, Number(row.departureLat), Number(row.departureLng))
        : null;
    const driver = buildDriverProfile(
      row.driverId,
      nameByDriver.get(row.driverId) ?? '',
      rating?.averageRating ?? null,
      rating?.reviewCount ?? 0,
    );
    return {
      ...serialize(row, driver),
      driverRating: rating?.averageRating ?? null,
      driverReviewCount: rating?.reviewCount ?? 0,
      distanceKm,
    };
  });
}

/** Map a DB row (Date columns, DB column names) to the Zod contract shape. */
function serialize(row: typeof trajet.$inferSelect, driver: DriverProfile): Trajet {
  return {
    id: row.id,
    driverId: row.driverId,
    departureCity: row.departureCity,
    destinationCity: row.arrivalCity,
    departureLat: row.departureLat !== null ? Number(row.departureLat) : null,
    departureLng: row.departureLng !== null ? Number(row.departureLng) : null,
    arrivalLat: row.arrivalLat !== null ? Number(row.arrivalLat) : null,
    arrivalLng: row.arrivalLng !== null ? Number(row.arrivalLng) : null,
    departureDateTime: row.departureAt.toISOString(),
    departurePlace: row.departurePlace,
    arrivalPlace: row.arrivalPlace,
    arrivalDateTime: row.arrivalAt ? row.arrivalAt.toISOString() : null,
    seatsTotal: row.seatsTotal,
    seatsAvailable: row.seatsAvailable,
    pricePerSeat: Number(row.pricePerSeat),
    description: row.description,
    comfort: row.comfort as Trajet['comfort'],
    baggageAllowance: row.baggageAllowance,
    amenities: (row.amenities ?? []) as Trajet['amenities'],
    paymentMethods: (row.paymentMethods?.length ? row.paymentMethods : ['cash']) as Trajet['paymentMethods'],
    hasIntermediateStop: row.hasIntermediateStop,
    driver,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeBooking(row: typeof booking.$inferSelect): Booking {
  return {
    id: row.id,
    trajetId: row.trajetId,
    passengerId: row.passengerId,
    seats: row.seats,
    status: row.status as Booking['status'],
    paymentMethod: (row.paymentMethod ?? 'cash') as Booking['paymentMethod'],
    fareCents: row.fareCents ?? 0,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Map a `booking` INNER JOIN `trajet` row to the Zod contract shape. */
function serializeBookingWithTrajet(row: {
  id: string;
  trajetId: string;
  passengerId: string;
  seats: number;
  status: string;
  paymentMethod: string;
  fareCents: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  createdAt: Date;
  updatedAt: Date;
  departureCity: string;
  arrivalCity: string;
  departureAt: Date;
  pricePerSeat: string;
}): BookingWithTrajet {
  return {
    id: row.id,
    trajetId: row.trajetId,
    passengerId: row.passengerId,
    seats: row.seats,
    status: row.status as BookingWithTrajet['status'],
    paymentMethod: (row.paymentMethod ?? 'cash') as BookingWithTrajet['paymentMethod'],
    fareCents: row.fareCents ?? 0,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    trajet: {
      departureCity: row.departureCity,
      destinationCity: row.arrivalCity,
      departureDateTime: row.departureAt.toISOString(),
      pricePerSeat: Number(row.pricePerSeat),
    },
  };
}
