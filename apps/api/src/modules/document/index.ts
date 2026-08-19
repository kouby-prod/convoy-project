import { OpenAPIHono } from '@hono/zod-openapi';
import { desc, eq } from 'drizzle-orm';
import { ageOn, MIN_DRIVER_AGE, type DriverEligibility } from '@carpool/schemas';
import { requireAuth, getAuth, hasRole, type AuthEnv } from '../../auth';
import { db } from '../../db/client';
import { driverDocument } from '../../db/document';
import { driverEligibility } from '../../db/eligibility';
import { buildStorageKey, isKeyOwnedBy } from '../../storage/keys';
import { createUploadUrl, createViewUrl, objectExists, URL_TTL_SECONDS } from '../../storage/s3';
import { serializeDocument } from './serialize';
import {
  createUploadUrlRoute,
  createDocumentRoute,
  listMyDocumentsRoute,
  getDocumentFileRoute,
  getMyEligibilityRoute,
  putMyEligibilityRoute,
  putMyLicenseNumberRoute,
  putMyNameRoute,
} from './document.routes';

/**
 * Document module — an `OpenAPIHono` sub-app mounted by app.ts. It is exported
 * as the CHAINED result of `.openapi(...)` so its route types flow into
 * `AppType` (the RPC client and Swagger).
 *
 * This is the driver's half of document handling: submit, list your own, open
 * your own file. The reviewer's half lives in ../admin.
 */
const app = new OpenAPIHono<AuthEnv>();

// Unlike trajets, nothing here is public: every route touches one person's
// identity papers, so all of them sit behind a session.
app.use('/documents', requireAuth);
app.use('/documents/upload-url', requireAuth);
app.use('/documents/me', requireAuth);
app.use('/documents/:id/file', requireAuth);
app.use('/eligibility', requireAuth);
app.use('/eligibility/license-number', requireAuth);
app.use('/eligibility/name', requireAuth);

export const documentModule = app
  .openapi(createUploadUrlRoute, async (c) => {
    const { user: authUser } = getAuth(c);
    // `type`, `mimeType` and `sizeBytes` are not needed to sign the URL, but
    // validating them here means an oversized or unsupported file is refused
    // before any bytes move, rather than after a wasted upload.
    const { fileName } = c.req.valid('json');

    const storageKey = buildStorageKey(authUser.id, fileName);
    const uploadUrl = await createUploadUrl(storageKey);

    return c.json({ uploadUrl, storageKey, expiresInSeconds: URL_TTL_SECONDS }, 200);
  })
  .openapi(createDocumentRoute, async (c) => {
    const { user: authUser } = getAuth(c);
    const body = c.req.valid('json');

    // The key was minted for this caller in step 1. Re-deriving that from the
    // key's own prefix — rather than trusting the client's echo — is what stops
    // one driver from attaching another driver's upload to their account.
    if (!isKeyOwnedBy(body.storageKey, authUser.id)) {
      return c.json({ error: 'Unknown upload' }, 400);
    }

    // The bytes went browser → bucket, so the API has not seen the transfer
    // succeed. Without this check a cancelled upload still creates a queue entry
    // and the reviewer opens an empty document.
    if (!(await objectExists(body.storageKey))) {
      return c.json({ error: 'The file was not uploaded' }, 400);
    }

    const [row] = await db
      .insert(driverDocument)
      .values({
        ownerId: authUser.id,
        type: body.type,
        status: 'pending',
        storageKey: body.storageKey,
        fileName: body.fileName,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
        expiresOn: body.expiresOn ?? null,
      })
      .returning();
    if (!row) throw new Error('Insert returned no row'); // narrows away `undefined`

    return c.json(serializeDocument(row), 201);
  })
  .openapi(listMyDocumentsRoute, async (c) => {
    const { user: authUser } = getAuth(c);

    const rows = await db
      .select()
      .from(driverDocument)
      .where(eq(driverDocument.ownerId, authUser.id))
      // Newest first: a re-submission is a new row, and it is the one that
      // matters to the driver looking at the page.
      .orderBy(desc(driverDocument.submittedAt));

    return c.json(rows.map(serializeDocument), 200);
  })
  .openapi(getDocumentFileRoute, async (c) => {
    const { user: authUser } = getAuth(c);
    const { id } = c.req.valid('param');

    const [row] = await db.select().from(driverDocument).where(eq(driverDocument.id, id));
    if (!row) return c.json({ error: 'Not found' }, 404);

    // Owner or admin — the backoffice reads the file through this same route,
    // so the permission rule lives here rather than being duplicated there.
    if (row.ownerId !== authUser.id && !hasRole(authUser, 'admin')) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const viewUrl = await createViewUrl(row.storageKey, {
      fileName: row.fileName,
      mimeType: row.mimeType,
    });

    return c.json({ viewUrl, expiresInSeconds: URL_TTL_SECONDS }, 200);
  })
  .openapi(getMyEligibilityRoute, async (c) => {
    const { user: authUser } = getAuth(c);

    const [row] = await db
      .select()
      .from(driverEligibility)
      .where(eq(driverEligibility.userId, authUser.id));

    return c.json(toEligibility(row), 200);
  })
  .openapi(putMyEligibilityRoute, async (c) => {
    const { user: authUser } = getAuth(c);
    const { dateOfBirth } = c.req.valid('json');

    // A birth date in the future parses fine and yields a negative age, so it is
    // refused explicitly rather than left to the age comparison below.
    const age = ageOn(dateOfBirth);
    if (age < 0) return c.json({ error: 'The date of birth is in the future' }, 400);
    if (age < MIN_DRIVER_AGE) {
      return c.json({ error: `Drivers must be at least ${MIN_DRIVER_AGE} years old` }, 400);
    }

    // One row per driver: a corrected birth date replaces the old one instead of
    // stacking up, because a birth date is a fact rather than a submission. Only
    // `dateOfBirth`/`updatedAt` are in `set` — an existing `licenseNumber`/name
    // (saved independently, see `putMyLicenseNumberRoute`/`putMyNameRoute`) is
    // left untouched.
    const [row] = await db
      .insert(driverEligibility)
      .values({ userId: authUser.id, dateOfBirth })
      .onConflictDoUpdate({
        target: driverEligibility.userId,
        set: { dateOfBirth, updatedAt: new Date() },
      })
      .returning();

    return c.json(toEligibility(row), 200);
  })
  .openapi(putMyLicenseNumberRoute, async (c) => {
    const { user: authUser } = getAuth(c);
    const { licenseNumber } = c.req.valid('json');

    // Same upsert shape as putMyEligibilityRoute, mirrored: only `licenseNumber`/
    // `updatedAt` are in `set`, so an existing `dateOfBirth`/name survives untouched.
    const [row] = await db
      .insert(driverEligibility)
      .values({ userId: authUser.id, licenseNumber })
      .onConflictDoUpdate({
        target: driverEligibility.userId,
        set: { licenseNumber, updatedAt: new Date() },
      })
      .returning();

    return c.json(toEligibility(row), 200);
  })
  .openapi(putMyNameRoute, async (c) => {
    const { user: authUser } = getAuth(c);
    const { firstName, lastName } = c.req.valid('json');

    // Same upsert shape again: only `firstName`/`lastName`/`updatedAt` are in
    // `set`, so an existing `dateOfBirth`/`licenseNumber` survives untouched.
    const [row] = await db
      .insert(driverEligibility)
      .values({ userId: authUser.id, firstName, lastName })
      .onConflictDoUpdate({
        target: driverEligibility.userId,
        set: { firstName, lastName, updatedAt: new Date() },
      })
      .returning();

    return c.json(toEligibility(row), 200);
  });

/** Shape a stored (or absent) eligibility row into the contract, age derived. */
function toEligibility(
  row:
    | {
        dateOfBirth: string | null;
        licenseNumber: string | null;
        firstName: string | null;
        lastName: string | null;
      }
    | undefined,
): DriverEligibility {
  const dateOfBirth = row?.dateOfBirth ?? null;
  return {
    dateOfBirth,
    age: dateOfBirth ? ageOn(dateOfBirth) : null,
    isAdult: dateOfBirth !== null && ageOn(dateOfBirth) >= MIN_DRIVER_AGE,
    licenseNumber: row?.licenseNumber ?? null,
    firstName: row?.firstName ?? null,
    lastName: row?.lastName ?? null,
  };
}
