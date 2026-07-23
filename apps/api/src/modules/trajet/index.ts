import { OpenAPIHono } from '@hono/zod-openapi';
import { randomUUID } from 'crypto';
import { requireAuth, getAuth, type AuthEnv } from '../../auth';
import { pool } from '../../db/client';
import type { Trajet } from '@carpool/schemas';
import {
  listTrajetsRoute,
  getTrajetRoute,
  createTrajetRoute,
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

export const trajetModule = app
  .openapi(listTrajetsRoute, async (c) => {
    const result = await pool.query('SELECT * FROM trajet ORDER BY departure_at ASC');
    return c.json(result.rows.map(serialize), 200);
  })
  .openapi(getTrajetRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await pool.query('SELECT * FROM trajet WHERE id = $1', [id]);
    const row = result.rows[0];
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(serialize(row), 200);
  })
  .openapi(createTrajetRoute, async (c) => {
    const { user } = getAuth(c); // throws if requireAuth did not run (programmer error, not 401)
    const body = c.req.valid('json');
    const id = randomUUID();
    const now = new Date();
    const result = await pool.query(
      `INSERT INTO trajet (id, driver_id, departure_city, arrival_city, departure_at, seats_total, seats_available, price_per_seat, description, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        id,
        user.id,
        body.departureCity,
        body.destinationCity,
        body.departureDateTime,
        body.seatsTotal,
        body.seatsTotal,
        body.pricePerSeat.toString(),
        body.description ?? null,
        now.toISOString(),
        now.toISOString(),
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Insert returned no row');
    return c.json(serialize(row), 201);
  });

/** Map a DB row (Date columns) to the Zod contract shape (ISO strings). */
function serialize(row: Record<string, unknown>): Trajet {
  const stringifyDate = (value: unknown) =>
    typeof value === 'string'
      ? value
      : value instanceof Date
      ? value.toISOString()
      : String(value);

  return {
    id: String(row.id ?? row['id'] ?? ''),
    driverId: String(row.driver_id ?? row['driverId'] ?? ''),
    departureCity: String(row.departure_city ?? row.departureCity ?? ''),
    destinationCity: String(row.arrival_city ?? row.destinationCity ?? row.arrivalCity ?? ''),
    departureDateTime: stringifyDate(row.departure_at ?? row.departureDateTime ?? row.departureAt),
    seatsTotal: Number(row.seats_total ?? row.seatsTotal ?? 0),
    seatsAvailable: Number(row.seats_available ?? row.seatsAvailable ?? 0),
    pricePerSeat: Number(row.price_per_seat ?? row.pricePerSeat ?? 0),
    description:
      row.description === undefined || row.description === null
        ? null
        : String(row.description),
    comfort: row.comfort === undefined || row.comfort === null ? null : (String(row.comfort) as Trajet['comfort']),
    baggageAllowance:
      row.baggage_allowance === undefined || row.baggage_allowance === null
        ? null
        : String(row.baggage_allowance),
    createdAt: stringifyDate(row.created_at ?? row.createdAt),
    updatedAt: stringifyDate(row.updated_at ?? row.updatedAt),
  };
}
