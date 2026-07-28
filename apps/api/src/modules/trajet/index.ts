import { OpenAPIHono } from '@hono/zod-openapi';
import { and, arrayContains, asc, eq, gte, lte, ilike, sql, type SQL } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { requireAuth, getAuth, type AuthEnv } from '../../auth';
import { db } from '../../db/client';
import { user } from '../../db/auth-schema';
import { trajet, booking } from '../../db/trajet-schema';
import type { Trajet, Booking, TrajetAmenity, DriverProfile } from '@carpool/schemas';
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

/** A ride row joined to its driver's account — what every read returns. */
type TrajetRow = { trajet: typeof trajet.$inferSelect; driver: typeof user.$inferSelect | null };

const selectTrajetWithDriver = () =>
  db
    .select({ trajet, driver: user })
    .from(trajet)
    .leftJoin(user, eq(trajet.driverId, user.id));

export const trajetModule = app
  .openapi(listTrajetsRoute, async (c) => {
    const query = c.req.valid('query');
    const filters: SQL[] = [];

    if (query.from) filters.push(ilike(trajet.departureCity, `%${query.from}%`));
    if (query.to) filters.push(ilike(trajet.arrivalCity, `%${query.to}%`));
    if (query.seats !== undefined) filters.push(gte(trajet.seatsAvailable, query.seats));
    if (query.maxPrice !== undefined) {
      filters.push(lte(trajet.pricePerSeat, query.maxPrice.toString()));
    }
    // `date` is a calendar day and `time` the earliest departure on it, both
    // compared in UTC — the zone the web app builds its instants in.
    if (query.date) {
      filters.push(sql`${trajet.departureAt}::date = ${query.date}::date`);
    }
    if (query.time) {
      filters.push(sql`${trajet.departureAt}::time >= ${query.time}::time`);
    }
    if (query.stopPolicy === 'direct') filters.push(eq(trajet.hasIntermediateStop, false));
    if (query.stopPolicy === 'withStops') filters.push(eq(trajet.hasIntermediateStop, true));
    // Every selected amenity must be offered — filters narrow, they never widen.
    // `arrayContains` builds the `@>` comparison with the array bound as a real
    // Postgres array; interpolating it into a raw sql`` template sends it as a
    // scalar and the driver rejects it.
    if (query.amenities.length > 0) {
      filters.push(arrayContains(trajet.amenities, query.amenities));
    }

    const rows = await selectTrajetWithDriver()
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(asc(trajet.departureAt));

    return c.json(rows.map(serialize), 200);
  })
  .openapi(getTrajetRoute, async (c) => {
    const { id } = c.req.valid('param');
    const [row] = await selectTrajetWithDriver().where(eq(trajet.id, id));
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(serialize(row), 200);
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
        hasIntermediateStop: body.hasIntermediateStop ?? false,
      })
      .returning();
    if (!row) throw new Error('Insert returned no row'); // narrows away `undefined`

    // Re-read through the join so the response carries the same driver shape as
    // every other read, rather than a second hand-built profile.
    const [joined] = await selectTrajetWithDriver().where(eq(trajet.id, row.id));
    return c.json(serialize(joined ?? { trajet: row, driver: null }), 201);
  })
  .openapi(bookTrajetRoute, async (c) => {
    const { user: authUser } = getAuth(c);
    const { id } = c.req.valid('param');
    const { seats, firstName, lastName, email, phone, message } = c.req.valid('json');

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
          passengerId: authUser.id,
          seats,
          status: 'confirmed',
          firstName: firstName ?? null,
          lastName: lastName ?? null,
          email: email ?? null,
          phone: phone ?? null,
          message: message ?? null,
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

/**
 * Split an account's display name into first/last. BetterAuth stores a single
 * `name` field, so everything after the first space becomes the surname.
 */
function splitName(name: string | undefined | null): { firstName: string; lastName: string } {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') };
}

/**
 * Build the driver profile from the joined account.
 *
 * Vehicle details and review scores are null on purpose: there is no vehicle
 * table and no reviews yet, so the API reports "unknown" rather than inventing
 * a car or a rating. The UI omits those blocks when null.
 */
function toDriverProfile(row: typeof user.$inferSelect | null, driverId: string): DriverProfile {
  const { firstName, lastName } = splitName(row?.name);
  return {
    id: row?.id ?? driverId,
    firstName,
    lastName,
    licenceYears: null,
    carMake: null,
    carModel: null,
    carSeats: null,
    rating: null,
    reviewCount: null,
  };
}

/** Map a joined DB row (Date columns, DB column names) to the Zod contract shape. */
function serialize({ trajet: row, driver }: TrajetRow): Trajet {
  return {
    id: row.id,
    driverId: row.driverId,
    departureCity: row.departureCity,
    destinationCity: row.arrivalCity,
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
    amenities: (row.amenities ?? []) as TrajetAmenity[],
    hasIntermediateStop: row.hasIntermediateStop,
    driver: toDriverProfile(driver, row.driverId),
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
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
