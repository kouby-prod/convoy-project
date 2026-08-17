import { OpenAPIHono } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { requireAuth, getAuth, type AuthEnv } from '../../auth';
import { db } from '../../db/client';
import { vehicle } from '../../db/vehicle';
import { getMyVehicleRoute, putMyVehicleRoute } from './vehicle.routes';

/**
 * Vehicle module — an `OpenAPIHono` sub-app mounted by app.ts (see
 * apps/api/src/modules/README.md). It is exported as the CHAINED result of
 * `.openapi(...)` so its route types flow into `AppType` (the RPC client and
 * Swagger).
 *
 * Both routes are self-scoped ("my vehicle") — nobody reads or writes
 * another driver's car description, so both sit behind a session.
 */
const app = new OpenAPIHono<AuthEnv>();

app.use('/vehicles/me', requireAuth);

export const vehicleModule = app
  .openapi(getMyVehicleRoute, async (c) => {
    const { user: authUser } = getAuth(c);

    const [row] = await db.select().from(vehicle).where(eq(vehicle.ownerId, authUser.id));
    if (!row) return c.json({ error: 'No vehicle declared yet' }, 404);

    return c.json(serialize(row), 200);
  })
  .openapi(putMyVehicleRoute, async (c) => {
    const { user: authUser } = getAuth(c);
    const body = c.req.valid('json');

    // One row per driver: a corrected description replaces the old one
    // instead of stacking up, because a car's colour/plate is a fact rather
    // than a submission.
    const [row] = await db
      .insert(vehicle)
      .values({ ownerId: authUser.id, ...body })
      .onConflictDoUpdate({
        target: vehicle.ownerId,
        set: { ...body, updatedAt: new Date() },
      })
      .returning();
    if (!row) throw new Error('Upsert returned no row'); // narrows away `undefined`

    return c.json(serialize(row), 200);
  });

/** Map a DB row (Date columns) to the Zod contract shape (ISO strings). */
function serialize(row: typeof vehicle.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
