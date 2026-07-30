import { OpenAPIHono } from '@hono/zod-openapi';
import { and, eq, gte, ilike, lt, lte } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { requireAuth, getAuth, type AuthEnv } from '../../auth';
import { db } from '../../db/client';
import { trajet, booking } from '../../db/trajet-schema';
import type { Trajet, Booking, BookingWithTrajet } from '@carpool/schemas';
import {
  listTrajetsRoute,
  getTrajetRoute,
  createTrajetRoute,
  bookTrajetRoute,
  listTrajetBookingsRoute,
  updateBookingStatusRoute,
  cancelBookingRoute,
  myTrajetsRoute,
  myBookingsRoute,
} from './trajet.routes';

/**
 * Trajet module — an `OpenAPIHono` sub-app mounted by app.ts (see
 * apps/api/src/modules/README.md). It is exported as the CHAINED result of
 * `.openapi(...)` so its route types flow into `AppType` (the RPC client and
 * Swagger). Exporting the bare `new OpenAPIHono()` would drop the route types
 * and `api.trajet` would not exist on the typed client.
 */
const app = new OpenAPIHono<AuthEnv>();

// Reads are public; creating requires authentication. Adjust to your auth rules
// (e.g. add `requireRole('admin')` from ../../auth for admin-only mutations).
app.use('/trajets', async (c, next) =>
  c.req.method === 'POST' ? requireAuth(c, next) : next(),
);
app.use('/trajets/:id/book', requireAuth);
app.use('/trajets/:id/bookings', requireAuth);
app.use('/trajets/:id/bookings/:bookingId', requireAuth);
app.use('/trajets/:id/bookings/:bookingId/cancel', requireAuth);
app.use('/me/trajets', requireAuth);
app.use('/me/bookings', requireAuth);

export const trajetModule = app
  .openapi(listTrajetsRoute, async (c) => {
    const query = c.req.valid('query');
    const conditions = [];

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

    const rows = conditions.length
      ? await db.select().from(trajet).where(and(...conditions))
      : await db.select().from(trajet);
    return c.json(rows.map(serialize), 200);
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
  .openapi(bookTrajetRoute, async (c) => {
    const { user } = getAuth(c);
    const { id } = c.req.valid('param');
    const { seats } = c.req.valid('json');

    const result = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(trajet).where(eq(trajet.id, id)).for('update');
      if (!row) return { ok: false as const, status: 404 as const, error: 'Not found' };
      if (row.driverId === user.id) {
        return { ok: false as const, status: 403 as const, error: 'Cannot book your own trajet' };
      }
      if (row.seatsAvailable < seats) {
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
        .set({ seatsAvailable: row.seatsAvailable - seats })
        .where(eq(trajet.id, id));

      return { ok: true as const, booking: created };
    });

    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json(serializeBooking(result.booking), 201);
  })
  .openapi(listTrajetBookingsRoute, async (c) => {
    const { user } = getAuth(c);
    const { id } = c.req.valid('param');

    const [trajetRow] = await db.select().from(trajet).where(eq(trajet.id, id));
    if (!trajetRow) return c.json({ error: 'Trajet not found' }, 404);
    if (trajetRow.driverId !== user.id) {
      return c.json({ error: 'Not the driver of this trajet' }, 403);
    }

    const rows = await db.select().from(booking).where(eq(booking.trajetId, id));
    return c.json(rows.map(serializeBooking), 200);
  })
  .openapi(updateBookingStatusRoute, async (c) => {
    const { user } = getAuth(c);
    const { id, bookingId } = c.req.valid('param');
    const { status } = c.req.valid('json');

    const result = await db.transaction(async (tx) => {
      const [trajetRow] = await tx.select().from(trajet).where(eq(trajet.id, id)).for('update');
      if (!trajetRow) return { ok: false as const, status: 404 as const, error: 'Trajet not found' };
      if (trajetRow.driverId !== user.id) {
        return { ok: false as const, status: 403 as const, error: 'Not the driver of this trajet' };
      }

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
          .set({ seatsAvailable: trajetRow.seatsAvailable + bookingRow.seats })
          .where(eq(trajet.id, id));
      }

      return { ok: true as const, booking: updated };
    });

    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json(serializeBooking(result.booking), 200);
  })
  .openapi(cancelBookingRoute, async (c) => {
    const { user } = getAuth(c);
    const { id, bookingId } = c.req.valid('param');

    const result = await db.transaction(async (tx) => {
      const [trajetRow] = await tx.select().from(trajet).where(eq(trajet.id, id)).for('update');
      if (!trajetRow) return { ok: false as const, status: 404 as const, error: 'Trajet not found' };

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
        .set({ seatsAvailable: trajetRow.seatsAvailable + bookingRow.seats })
        .where(eq(trajet.id, id));

      return { ok: true as const, booking: updated };
    });

    if (!result.ok) return c.json({ error: result.error }, result.status);
    return c.json(serializeBooking(result.booking), 200);
  })
  .openapi(myTrajetsRoute, async (c) => {
    const { user } = getAuth(c);
    const rows = await db.select().from(trajet).where(eq(trajet.driverId, user.id));
    return c.json(rows.map(serialize), 200);
  })
  .openapi(myBookingsRoute, async (c) => {
    const { user } = getAuth(c);
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
      .where(eq(booking.passengerId, user.id));

    return c.json(rows.map(serializeBookingWithTrajet), 200);
  });

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
