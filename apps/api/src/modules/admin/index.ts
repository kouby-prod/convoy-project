import { OpenAPIHono } from '@hono/zod-openapi';
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { requireAuth, requireRole, getAuth, type AuthEnv } from '../../auth';
import { db } from '../../db/client';
import { user } from '../../db/auth-schema';
import { driverDocument } from '../../db/document';
import { driverEligibility } from '../../db/eligibility';
import {
  deriveDriverVerification,
  REQUIRED_DRIVER_DOCUMENT_TYPES,
  type AdminDocument,
  type DocumentSubmitter,
  type DriverVerification,
} from '@carpool/schemas';
import { serializeDocument } from '../document/serialize';
import { driverPayout, reconciliationMismatch } from '../../db/payment';
import { markDriverPayoutPaid, serializeDriverPayout } from '../payment/payout';
import { serializeMismatch } from '../payment/incidents';
import {
  getAdminStatsRoute,
  listAdminDocumentsRoute,
  reviewDocumentRoute,
  listAdminUsersRoute,
  listAdminPayoutsRoute,
  markAdminPayoutPaidRoute,
  listAdminMismatchesRoute,
  resolveAdminMismatchRoute,
} from './admin.routes';

/**
 * Admin module — the backoffice. An `OpenAPIHono` sub-app mounted by app.ts,
 * exported as the CHAINED result of `.openapi(...)` so its route types flow into
 * `AppType` (the RPC client and Swagger).
 *
 * It owns no table of its own: it reads `driver_document` and `user`, and its
 * only write is the review decision on a submission. The driver-facing half
 * lives in ../document.
 */
const app = new OpenAPIHono<AuthEnv>();

// Guarded path by path rather than with a blanket '/admin/*': the proof route
// GET /admin/health is registered on the parent app and already has its own
// gate, and a wildcard here would make every request re-read the session twice.
app.use('/admin/stats', requireAuth, requireRole('admin'));
app.use('/admin/users', requireAuth, requireRole('admin'));
app.use('/admin/documents', requireAuth, requireRole('admin'));
app.use('/admin/documents/:id', requireAuth, requireRole('admin'));
app.use('/admin/payouts', requireAuth, requireRole('admin'));
app.use('/admin/payouts/:id', requireAuth, requireRole('admin'));
app.use('/admin/payouts/:id/paid', requireAuth, requireRole('admin'));
app.use('/admin/payments/incidents', requireAuth, requireRole('admin'));
app.use('/admin/payments/incidents/:id/resolve', requireAuth, requireRole('admin'));

/** A submission joined to its submitter — what every queue read returns. */
type AdminDocumentRow = {
  document: typeof driverDocument.$inferSelect;
  owner: typeof user.$inferSelect;
};

/**
 * `innerJoin`, not `leftJoin`: `owner_id` is a cascading foreign key, so a
 * submission without an account cannot exist — and the inner join is what makes
 * `owner` non-nullable for the serializer.
 */
const selectDocumentWithOwner = () =>
  db
    .select({ document: driverDocument, owner: user })
    .from(driverDocument)
    .innerJoin(user, eq(driverDocument.ownerId, user.id));

export const adminModule = app
  .openapi(getAdminStatsRoute, async (c) => {
    // Three narrow aggregates instead of one wide join: counting documents and
    // counting accounts over the same join would multiply the account rows.
    const [documents] = await db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`(count(*) filter (where ${driverDocument.status} = 'pending'))::int`,
        approved: sql<number>`(count(*) filter (where ${driverDocument.status} = 'approved'))::int`,
        rejected: sql<number>`(count(*) filter (where ${driverDocument.status} = 'rejected'))::int`,
      })
      .from(driverDocument);

    const [users] = await db
      .select({
        total: sql<number>`count(*)::int`,
        // Roles are stored comma-separated, so membership is tested against the
        // split list — `like '%admin%'` would also match a role named 'subadmin'.
        admins: sql<number>`(count(*) filter (where 'admin' = any(string_to_array(coalesce(${user.role}, ''), ','))))::int`,
      })
      .from(user);

    const [awaiting] = await db
      .select({ value: sql<number>`count(distinct ${driverDocument.ownerId})::int` })
      .from(driverDocument)
      .where(eq(driverDocument.status, 'pending'));

    const [incidents] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(reconciliationMismatch)
      .where(eq(reconciliationMismatch.status, 'open'));

    return c.json(
      {
        documents: {
          total: documents?.total ?? 0,
          pending: documents?.pending ?? 0,
          approved: documents?.approved ?? 0,
          rejected: documents?.rejected ?? 0,
        },
        users: {
          total: users?.total ?? 0,
          admins: users?.admins ?? 0,
          awaitingReview: awaiting?.value ?? 0,
        },
        payments: {
          openIncidents: incidents?.value ?? 0,
        },
      },
      200,
    );
  })
  .openapi(listAdminDocumentsRoute, async (c) => {
    const query = c.req.valid('query');
    const filters: SQL[] = [];

    if (query.status) filters.push(eq(driverDocument.status, query.status));
    if (query.type) filters.push(eq(driverDocument.type, query.type));
    if (query.q) {
      // Free-text hits the person, not the paperwork — a reviewer searches for
      // "who", and the document has no name of its own to match on.
      const term = `%${query.q}%`;
      const match = or(ilike(user.name, term), ilike(user.email, term));
      if (match) filters.push(match);
    }

    const rows = await selectDocumentWithOwner()
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(driverDocument.submittedAt));

    const verifications = await loadVerifications(rows.map((row) => row.owner.id));

    return c.json(
      rows.map((row) => serializeAdminDocument(row, verifications)),
      200,
    );
  })
  .openapi(reviewDocumentRoute, async (c) => {
    const { user: adminUser } = getAuth(c);
    const { id } = c.req.valid('param');
    const { status, note, ageConfirmed } = c.req.valid('json');

    // Read before write: approving a LICENCE also settles the minimum-age rule,
    // and that has to be an explicit confirmation rather than a by-product of
    // clicking approve. Only the licence shows a birth date, so only it can.
    const [existing] = await db.select().from(driverDocument).where(eq(driverDocument.id, id));
    if (!existing) return c.json({ error: 'Not found' }, 404);

    if (status === 'approved' && existing.type === 'permis' && ageConfirmed !== true) {
      return c.json(
        { error: 'Confirm the date of birth on the licence before approving it' },
        400,
      );
    }

    const [updated] = await db
      .update(driverDocument)
      .set({
        status,
        // An approval clears any earlier rejection reason — leaving it would
        // show the driver a complaint about a document that is now accepted.
        reviewNote: status === 'rejected' ? (note ?? null) : null,
        // Only ever true on an approved licence; a refusal or a re-review of
        // another type must not leave a stale confirmation behind.
        ageConfirmed: status === 'approved' && existing.type === 'permis' && ageConfirmed === true,
        reviewedBy: adminUser.id,
        reviewedAt: new Date(),
      })
      .where(eq(driverDocument.id, id))
      .returning();
    if (!updated) return c.json({ error: 'Not found' }, 404);

    // Re-read through the join so the response carries the same shape as the
    // queue, rather than a second hand-built owner.
    const [joined] = await selectDocumentWithOwner().where(eq(driverDocument.id, updated.id));
    if (!joined) return c.json({ error: 'Not found' }, 404);

    // Recomputed after the write, so the response already reflects the decision
    // that was just made — the queue re-renders the new progress without a
    // second round trip.
    const verifications = await loadVerifications([joined.owner.id]);

    return c.json(serializeAdminDocument(joined, verifications), 200);
  })
  .openapi(listAdminUsersRoute, async (c) => {
    // `leftJoin` so accounts with no documents still appear — those are exactly
    // the drivers a reviewer wants to notice.
    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        role: user.role,
        phoneNumber: user.phoneNumber,
        createdAt: user.createdAt,
        documentCount: sql<number>`count(${driverDocument.id})::int`,
        pendingCount: sql<number>`(count(*) filter (where ${driverDocument.status} = 'pending'))::int`,
        approvedCount: sql<number>`(count(*) filter (where ${driverDocument.status} = 'approved'))::int`,
      })
      .from(user)
      .leftJoin(driverDocument, eq(driverDocument.ownerId, user.id))
      .groupBy(user.id)
      .orderBy(desc(user.createdAt));

    // The tallies above count every submission; verification counts only the two
    // required types. A driver can hold three approved documents and still not
    // be verified, so the verdict is computed rather than inferred from a total.
    const verifications = await loadVerifications(rows.map((row) => row.id));

    return c.json(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        emailVerified: row.emailVerified,
        role: row.role,
        phoneNumber: row.phoneNumber,
        createdAt: row.createdAt.toISOString(),
        documentCount: row.documentCount,
        pendingCount: row.pendingCount,
        approvedCount: row.approvedCount,
        verification: verifications.get(row.id) ?? deriveDriverVerification([]),
      })),
      200,
    );
  })
  .openapi(listAdminPayoutsRoute, async (c) => {
    const query = c.req.valid('query');
    const rows = await db
      .select()
      .from(driverPayout)
      .where(query.status ? eq(driverPayout.status, query.status) : undefined)
      .orderBy(desc(driverPayout.createdAt));
    return c.json(rows.map(serializeDriverPayout), 200);
  })
  .openapi(markAdminPayoutPaidRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const [existing] = await db.select().from(driverPayout).where(eq(driverPayout.id, id));
    if (!existing) return c.json({ error: 'Not found' }, 404);
    const paid = await markDriverPayoutPaid(id, body.ref);
    if (!paid) return c.json({ error: 'Payout is not held or due' }, 400);
    return c.json(paid, 200);
  })
  .openapi(listAdminMismatchesRoute, async (c) => {
    const query = c.req.valid('query');
    const rows = await db
      .select()
      .from(reconciliationMismatch)
      .where(query.status ? eq(reconciliationMismatch.status, query.status) : undefined)
      .orderBy(desc(reconciliationMismatch.createdAt));
    return c.json(rows.map(serializeMismatch), 200);
  })
  .openapi(resolveAdminMismatchRoute, async (c) => {
    const { user: adminUser } = getAuth(c);
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const [existing] = await db.select().from(reconciliationMismatch).where(eq(reconciliationMismatch.id, id));
    if (!existing) return c.json({ error: 'Not found' }, 404);
    if (existing.status === 'resolved') return c.json({ error: 'Incident is already resolved' }, 400);
    const [updated] = await db
      .update(reconciliationMismatch)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: adminUser.id,
        note: body.note?.trim() ? body.note.trim() : existing.note,
      })
      .where(eq(reconciliationMismatch.id, id))
      .returning();
    if (!updated) return c.json({ error: 'Not found' }, 404);
    return c.json(serializeMismatch(updated), 200);
  });

/**
 * Every submitter's verification state, in one query for the whole page.
 *
 * Done as a second round trip rather than a window function over the queue join
 * because the rollup must consider a driver's required documents even when the
 * current filter hides them — reviewing a `pending` licence still has to report
 * that the ID card was refused last week.
 *
 * Only the required types are read; `carteGrise` and `assurance` submissions do
 * not count towards verification and would only be discarded.
 */
async function loadVerifications(ownerIds: string[]): Promise<Map<string, DriverVerification>> {
  const unique = [...new Set(ownerIds)];
  const byOwner = new Map<
    string,
    { type: string; status: string; submittedAt: Date; ageConfirmed: boolean }[]
  >();
  const birthDates = new Map<string, string>();

  // Guard the empty case: `inArray(col, [])` is a false constant in Drizzle, so
  // this is about skipping a pointless round trip, not about correctness.
  if (unique.length > 0) {
    // Documents and declarations in parallel — neither depends on the other, and
    // the verdict needs both: three approved files with no confirmed birth date
    // is not a verified driver.
    const [rows, declarations] = await Promise.all([
      db
        .select({
          ownerId: driverDocument.ownerId,
          type: driverDocument.type,
          status: driverDocument.status,
          submittedAt: driverDocument.submittedAt,
          ageConfirmed: driverDocument.ageConfirmed,
        })
        .from(driverDocument)
        .where(
          and(
            inArray(driverDocument.ownerId, unique),
            inArray(driverDocument.type, [...REQUIRED_DRIVER_DOCUMENT_TYPES]),
          ),
        ),
      db
        .select({
          userId: driverEligibility.userId,
          dateOfBirth: driverEligibility.dateOfBirth,
        })
        .from(driverEligibility)
        .where(inArray(driverEligibility.userId, unique)),
    ]);

    for (const row of rows) {
      const bucket = byOwner.get(row.ownerId);
      if (bucket) bucket.push(row);
      else byOwner.set(row.ownerId, [row]);
    }
    for (const row of declarations) birthDates.set(row.userId, row.dateOfBirth);
  }

  // Every requested owner gets an entry, so a driver with nothing on file reads
  // as `incomplete` rather than being absent from the map.
  return new Map(
    unique.map((id) => [
      id,
      deriveDriverVerification(byOwner.get(id) ?? [], {
        dateOfBirth: birthDates.get(id) ?? null,
      }),
    ]),
  );
}

/** The submitter as a reviewer sees them — identity only, nothing sensitive. */
function toSubmitter(
  row: typeof user.$inferSelect,
  verification: DriverVerification,
): DocumentSubmitter {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    phoneNumber: row.phoneNumber,
    verification,
  };
}

/**
 * A queue row = the driver-facing document plus its submitter. Reusing
 * `serializeDocument` is what keeps the reviewer and the driver looking at the
 * same fields for the same row.
 */
function serializeAdminDocument(
  { document, owner }: AdminDocumentRow,
  verifications: Map<string, DriverVerification>,
): AdminDocument {
  const verification = verifications.get(owner.id) ?? deriveDriverVerification([]);
  return { ...serializeDocument(document), owner: toSubmitter(owner, verification) };
}
