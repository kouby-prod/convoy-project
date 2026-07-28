import { OpenAPIHono } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { requireAuth, getAuth, type AuthEnv } from '../../auth';
import { db } from '../../db/client';
import { trajet, booking } from '../../db/trajet-schema';
import type { Trajet, Booking } from '@carpool/schemas';
import {
  listTrajetsRoute,
  getTrajetRoute,
  createTrajetRoute,
  bookTrajetRoute,
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

export const trajetModule = app
  .openapi(listTrajetsRoute, async (c) => {
    const rows = await db.select().from(trajet);
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
          status: 'confirmed',
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
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
