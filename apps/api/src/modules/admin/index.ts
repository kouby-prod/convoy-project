import { OpenAPIHono } from '@hono/zod-openapi';
import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { requireAuth, requireRole, getAuth, type AuthEnv } from '../../auth';
import { db } from '../../db/client';
import { user } from '../../db/auth-schema';
import { driverDocument } from '../../db/document';
import type { AdminDocument, DocumentSubmitter } from '@carpool/schemas';
import { serializeDocument } from '../document/serialize';
import {
  getAdminStatsRoute,
  listAdminDocumentsRoute,
  reviewDocumentRoute,
  listAdminUsersRoute,
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

    return c.json(rows.map(serializeAdminDocument), 200);
  })
  .openapi(reviewDocumentRoute, async (c) => {
    const { user: adminUser } = getAuth(c);
    const { id } = c.req.valid('param');
    const { status, note } = c.req.valid('json');

    const [updated] = await db
      .update(driverDocument)
      .set({
        status,
        // An approval clears any earlier rejection reason — leaving it would
        // show the driver a complaint about a document that is now accepted.
        reviewNote: status === 'rejected' ? (note ?? null) : null,
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

    return c.json(serializeAdminDocument(joined), 200);
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
      })),
      200,
    );
  });

/** The submitter as a reviewer sees them — identity only, nothing sensitive. */
function toSubmitter(row: typeof user.$inferSelect): DocumentSubmitter {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    phoneNumber: row.phoneNumber,
  };
}

/**
 * A queue row = the driver-facing document plus its submitter. Reusing
 * `serializeDocument` is what keeps the reviewer and the driver looking at the
 * same fields for the same row.
 */
function serializeAdminDocument({ document, owner }: AdminDocumentRow): AdminDocument {
  return { ...serializeDocument(document), owner: toSubmitter(owner) };
}
