import { OpenAPIHono } from '@hono/zod-openapi';
import { and, avg, count, eq, gte, ilike, inArray, isNull, lt, lte } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { requireAuth, getAuth, type AuthEnv } from '../../auth';
import { rateLimit } from '../../middleware/rate-limit';
import { db } from '../../db/client';
import { trajet, booking } from '../../db/trajet-schema';
import { review } from '../../db/review';
import type { Trajet, TrajetSearchResult, Booking, BookingWithTrajet } from '@carpool/schemas';
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
import { notifyUser, trajetUrl, trajetSearchUrl, describeTrip } from './notifications';

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
  tx: Pick<typeof db, 'update'>,
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
      conditions.push(gte(trajet.departureAt, dayStart), lt(trajet.departureAt, dayEnd));
    }
    if (query.minSeats !== undefined) conditions.push(gte(trajet.seatsAvailable, query.minSeats));
    if (query.maxPrice !== undefined) conditions.push(lte(trajet.pricePerSeat, query.maxPrice.toString()));
    if (query.comfort) conditions.push(eq(trajet.comfort, query.comfort));
    if (query.baggageAllowance) {
      conditions.push(ilike(trajet.baggageAllowance, `%${query.baggageAllowance}%`));
    }
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

    const offset = (query.page - 1) * query.limit;
    const rows = await db
      .select()
      .from(trajet)
      .where(and(...conditions))
      .limit(query.limit + 1)
      .offset(offset);

    const { items, hasMore } = paginate(rows, query.limit);
    const withRating = await attachDriverRatings(items);
    return c.json({ items: withRating, page: query.page, limit: query.limit, hasMore }, 200);
  })
  .openapi(getTrajetRoute, async (c) => {
    const { id } = c.req.valid('param');
    const [row] = await db.select().from(trajet).where(eq(trajet.id, id));
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(serialize(row), 200);
  })
  .openapi(createTrajetRoute, async (c) => {
    const { user } = getAuth(c); // throws if requireAuth did not run (programmer error, not 401)
    const body = c.req.valid('json');
    const [row] = await db
      .insert(trajet)
      .values({
        id: randomUUID(),
        driverId: user.id,
        departureCity: body.departureCity,
        arrivalCity: body.destinationCity,
        departureAt: new Date(body.departureDateTime),
        seatsTotal: body.seatsTotal,
        seatsAvailable: body.seatsTotal,
        pricePerSeat: body.pricePerSeat.toString(),
        description: body.description ?? null,
        comfort: body.comfort ?? null,
        baggageAllowance: body.baggageAllowance ?? null,
      })
      .returning();
    if (!row) throw new Error('Insert returned no row'); // narrows away `undefined`
    return c.json(serialize(row), 201);
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
        })
        .where(eq(trajet.id, id))
        .returning();
      if (!updated) throw new Error('Update returned no row');

      return { ok: true as const, trajet: updated };
    });

    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json(serialize(result.trajet), 200);
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
      const cancelledBookings = await tx
        .update(booking)
        .set({ status: 'cancelled' })
        .where(and(eq(booking.trajetId, id), inArray(booking.status, ['pending', 'confirmed'])))
        .returning({ passengerId: booking.passengerId });

      return { ok: true as const, trajet: updated, cancelledBookings };
    });

    if (!result.ok) return c.json({ error: result.error }, result.status);
    await Promise.all(
      result.cancelledBookings.map(({ passengerId }) =>
        notifyUser(
          passengerId,
          'Your Carpool trip was cancelled',
          `The driver cancelled the trip from ${describeTrip(result.trajet)} you had booked. Search for another ride: ${trajetSearchUrl()}`,
        ),
      ),
    );
    return c.json(serialize(result.trajet), 200);
  })
  .openapi(bookTrajetRoute, async (c) => {
    const { user } = getAuth(c);
    const { id } = c.req.valid('param');
    const { seats } = c.req.valid('json');

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

      const sweep = await expireStalePendingBookings(tx, id, row.seatsAvailable);
      expiredBookings = sweep.expired;
      if (sweep.seatsAvailable < seats) {
        return { ok: false as const, status: 400 as const, error: 'Not enough seats available' };
      }

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
      const sweep = await expireStalePendingBookings(tx, id, trajetRow.seatsAvailable);
      expiredBookings = sweep.expired;

      const [bookingRow] = await tx.select().from(booking).where(eq(booking.id, bookingId));
      if (!bookingRow || bookingRow.trajetId !== id) {
        return { ok: false as const, status: 404 as const, error: 'Booking not found' };
      }
      if (bookingRow.status !== 'pending') {
        return { ok: false as const, status: 400 as const, error: 'Booking is not pending' };
      }

      const [updated] = await tx
        .update(booking)
        .set({ status })
        .where(eq(booking.id, bookingId))
        .returning();
      if (!updated) throw new Error('Update returned no row');

      // Rejecting frees the seats held when the booking was created; accepting
      // keeps them held (they were never released).
      if (status === 'rejected') {
        await tx
          .update(trajet)
          .set({ seatsAvailable: sweep.seatsAvailable + bookingRow.seats })
          .where(eq(trajet.id, id));
      }

      return {
        ok: true as const,
        booking: updated,
        passengerId: bookingRow.passengerId,
        departureCity: trajetRow.departureCity,
        arrivalCity: trajetRow.arrivalCity,
        departureAt: trajetRow.departureAt,
      };
    });

    if (trip) await notifyExpiredBookings(expiredBookings, trip);

    if (!result.ok) return c.json({ error: result.error }, result.status);
    await notifyUser(
      result.passengerId,
      status === 'confirmed' ? 'Your Carpool booking was confirmed' : 'Your Carpool booking was rejected',
      status === 'confirmed'
        ? `Your booking request for the trip from ${describeTrip(result)} was confirmed by the driver. View the trip: ${trajetUrl(id)}`
        : `Your booking request for the trip from ${describeTrip(result)} was rejected by the driver. Search for another ride: ${trajetSearchUrl()}`,
    );
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
      const sweep = await expireStalePendingBookings(tx, id, trajetRow.seatsAvailable);
      expiredBookings = sweep.expired;

      const [bookingRow] = await tx.select().from(booking).where(eq(booking.id, bookingId));
      if (!bookingRow || bookingRow.trajetId !== id) {
        return { ok: false as const, status: 404 as const, error: 'Booking not found' };
      }
      if (bookingRow.passengerId !== user.id) {
        return { ok: false as const, status: 403 as const, error: 'Not your booking' };
      }
      if (bookingRow.status !== 'pending' && bookingRow.status !== 'confirmed') {
        return { ok: false as const, status: 400 as const, error: 'Booking cannot be cancelled' };
      }

      const [updated] = await tx
        .update(booking)
        .set({ status: 'cancelled' })
        .where(eq(booking.id, bookingId))
        .returning();
      if (!updated) throw new Error('Update returned no row');

      // Both `pending` and `confirmed` hold seats (see bookTrajetRoute above),
      // so cancelling either always frees them back to the trajet.
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
      };
    });

    if (trip) await notifyExpiredBookings(expiredBookings, trip);

    if (!result.ok) return c.json({ error: result.error }, result.status);
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
    return c.json({ items: items.map(serialize), page, limit, hasMore }, 200);
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
 * reviews) via a single grouped query keyed on the page's distinct driver
 * ids, rather than one rating query per row.
 */
async function attachDriverRatings(rows: (typeof trajet.$inferSelect)[]): Promise<TrajetSearchResult[]> {
  const driverIds = [...new Set(rows.map((row) => row.driverId))];
  const ratingRows = driverIds.length
    ? await db
        .select({
          driverId: review.driverId,
          averageRating: avg(review.rating),
          reviewCount: count(review.rating),
        })
        .from(review)
        .where(and(inArray(review.driverId, driverIds), eq(review.direction, 'passenger_to_driver')))
        .groupBy(review.driverId)
    : [];
  const ratingByDriver = new Map(
    ratingRows.map((r) => [
      r.driverId,
      { averageRating: r.averageRating ? Number(r.averageRating) : null, reviewCount: r.reviewCount },
    ]),
  );

  return rows.map((row) => {
    const rating = ratingByDriver.get(row.driverId);
    return {
      ...serialize(row),
      driverRating: rating?.averageRating ?? null,
      driverReviewCount: rating?.reviewCount ?? 0,
    };
  });
}

/** Map a DB row (Date columns, DB column names) to the Zod contract shape. */
function serialize(row: typeof trajet.$inferSelect): Trajet {
  return {
    id: row.id,
    driverId: row.driverId,
    departureCity: row.departureCity,
    destinationCity: row.arrivalCity,
    departureDateTime: row.departureAt.toISOString(),
    seatsTotal: row.seatsTotal,
    seatsAvailable: row.seatsAvailable,
    pricePerSeat: Number(row.pricePerSeat),
    description: row.description,
    comfort: row.comfort as Trajet['comfort'],
    baggageAllowance: row.baggageAllowance,
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
