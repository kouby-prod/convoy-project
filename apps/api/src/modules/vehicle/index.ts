import { OpenAPIHono } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { requireAuth, getAuth, type AuthEnv } from '../../auth';
import { db } from '../../db/client';
import { vehicle } from '../../db/vehicle';
import { buildStorageKey, isKeyOwnedBy } from '../../storage/keys';
import { createUploadUrl, createViewUrl, objectExists, URL_TTL_SECONDS } from '../../storage/s3';
import {
  getMyVehicleRoute,
  putMyVehicleRoute,
  createVehiclePhotoUploadUrlRoute,
  putMyVehiclePhotoRoute,
  getVehiclePhotoRoute,
} from './vehicle.routes';

/**
 * Vehicle module — an `OpenAPIHono` sub-app mounted by app.ts (see
 * apps/api/src/modules/README.md). It is exported as the CHAINED result of
 * `.openapi(...)` so its route types flow into `AppType` (the RPC client and
 * Swagger).
 *
 * Every route but `GET /vehicles/{ownerId}/photo` is self-scoped ("my
 * vehicle") — nobody reads or writes another driver's car description, so
 * those sit behind a session. The photo view route is deliberately public: a
 * rider viewing a public ride listing is exactly who it is for.
 */
const app = new OpenAPIHono<AuthEnv>();

app.use('/vehicles/me', requireAuth);
app.use('/vehicles/me/photo-upload-url', requireAuth);
app.use('/vehicles/me/photo', requireAuth);

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
  })
  .openapi(createVehiclePhotoUploadUrlRoute, async (c) => {
    const { user: authUser } = getAuth(c);
    const { fileName } = c.req.valid('json');

    // Reuses the documents/<ownerId>/… key namespace — it is just "this
    // caller's own bucket prefix", not specific to identity documents.
    const storageKey = buildStorageKey(authUser.id, fileName);
    const uploadUrl = await createUploadUrl(storageKey);

    return c.json({ uploadUrl, storageKey, expiresInSeconds: URL_TTL_SECONDS }, 200);
  })
  .openapi(putMyVehiclePhotoRoute, async (c) => {
    const { user: authUser } = getAuth(c);
    const body = c.req.valid('json');

    if (!isKeyOwnedBy(body.storageKey, authUser.id)) {
      return c.json({ error: 'Unknown upload' }, 400);
    }
    if (!(await objectExists(body.storageKey))) {
      return c.json({ error: 'The file was not uploaded' }, 400);
    }

    // The photo attaches to an existing vehicle rather than upserting one:
    // Étape 3's own fields (plate above all) are what make the row exist.
    const [row] = await db
      .update(vehicle)
      .set({ photoKey: body.storageKey, photoMimeType: body.mimeType, updatedAt: new Date() })
      .where(eq(vehicle.ownerId, authUser.id))
      .returning();
    if (!row) return c.json({ error: 'Save your vehicle before adding a photo' }, 400);

    return c.json(serialize(row), 200);
  })
  .openapi(getVehiclePhotoRoute, async (c) => {
    const { ownerId } = c.req.valid('param');

    const [row] = await db.select().from(vehicle).where(eq(vehicle.ownerId, ownerId));
    if (!row?.photoKey) return c.json({ error: 'No photo on file' }, 404);

    const viewUrl = await createViewUrl(row.photoKey, {
      fileName: 'vehicle-photo',
      mimeType: row.photoMimeType ?? 'image/jpeg',
    });

    return c.json({ viewUrl, expiresInSeconds: URL_TTL_SECONDS }, 200);
  });

/** Map a DB row (Date columns, raw photoKey) to the Zod contract shape (ISO strings, hasPhoto). */
function serialize(row: typeof vehicle.$inferSelect) {
  const { photoKey, photoMimeType: _photoMimeType, ...rest } = row;
  return {
    ...rest,
    hasPhoto: photoKey !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
