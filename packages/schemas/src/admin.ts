import { z } from 'zod';
import {
  DocumentStatusSchema,
  DriverDocumentSchema,
  DriverDocumentTypeSchema,
  DriverVerificationSchema,
} from './document';

/* ═══════════════════════════════════════════════════════════════════════════
   Backoffice contract — what the `/admin` panel reads and writes.

   Everything here is served by admin-only routes (`requireAuth` +
   `requireRole('admin')`). The shapes are wider than the driver-facing ones on
   purpose: a reviewer needs to see WHO submitted a document, which the driver
   already knows and therefore never receives.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ────────────────────────── The submission queue ───────────────────────── */

/**
 * The account behind a submission, as shown on a queue row. Deliberately a
 * small subset of the user table — the backoffice reviews documents, it is not
 * an account browser, and nothing here is a credential.
 */
export const DocumentSubmitterSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
    phoneNumber: z.string().nullable(),
    /**
     * Where this driver stands across BOTH required documents, not just the one
     * on the row. A reviewer approving a licence needs to know whether that
     * completes the driver or still leaves an ID card outstanding — otherwise
     * the decision is made without the half of the picture that matters.
     */
    verification: DriverVerificationSchema,
  })
  .describe('DocumentSubmitter');
export type DocumentSubmitter = z.infer<typeof DocumentSubmitterSchema>;

/** A queue row: the document plus the driver who sent it. */
export const AdminDocumentSchema = DriverDocumentSchema.extend({
  owner: DocumentSubmitterSchema,
}).describe('AdminDocument');
export type AdminDocument = z.infer<typeof AdminDocumentSchema>;

export const AdminDocumentListSchema = z
  .array(AdminDocumentSchema)
  .describe('AdminDocumentList');

/**
 * Queue filters for `GET /admin/documents`. All optional, so a bare call shows
 * everything; the panel defaults the UI to `pending` because that is the work.
 */
export const AdminDocumentQuerySchema = z
  .object({
    status: DocumentStatusSchema.optional(),
    type: DriverDocumentTypeSchema.optional(),
    /** Free-text match on the submitter's name or email. */
    q: z.string().trim().optional(),
  })
  .describe('AdminDocumentQuery');
export type AdminDocumentQuery = z.infer<typeof AdminDocumentQuerySchema>;

/* ──────────────────────────── The review action ────────────────────────── */

/**
 * An admin's decision on one submission.
 *
 * A rejection carries a reason as a schema rule, not a UI convention: the
 * driver's only route back is fixing what was wrong, and "rejected, no reason
 * given" makes the panel unusable from the other side.
 */
export const ReviewDocumentSchema = z
  .object({
    status: z.enum(['approved', 'rejected']),
    note: z.string().trim().max(500).optional().nullable(),
    /**
     * Set when approving a LICENCE: the reviewer confirms the declared birth
     * date matches the one printed on it. Ignored for other document types —
     * only the licence shows a birth date, so only it can settle the age rule.
     *
     * The route refuses to approve a licence without it, which is what stops
     * "at least 18" from being an unchecked claim.
     */
    ageConfirmed: z.boolean().optional(),
  })
  .refine((value) => value.status !== 'rejected' || Boolean(value.note && value.note.length > 0), {
    message: 'A rejection must explain what is wrong with the document',
    path: ['note'],
  })
  .describe('ReviewDocument');
export type ReviewDocument = z.infer<typeof ReviewDocumentSchema>;

/* ───────────────────────────── The dashboard ───────────────────────────── */

/** Counters on the backoffice landing page. */
export const AdminStatsSchema = z
  .object({
    documents: z.object({
      total: z.number().int().nonnegative(),
      pending: z.number().int().nonnegative(),
      approved: z.number().int().nonnegative(),
      rejected: z.number().int().nonnegative(),
    }),
    users: z.object({
      total: z.number().int().nonnegative(),
      admins: z.number().int().nonnegative(),
      /** Accounts with at least one document still awaiting a decision. */
      awaitingReview: z.number().int().nonnegative(),
    }),
    payments: z.object({
      openIncidents: z.number().int().nonnegative(),
    }),
  })
  .describe('AdminStats');
export type AdminStats = z.infer<typeof AdminStatsSchema>;

/* ────────────────────────────── The user list ──────────────────────────── */

/**
 * A row in the read-only account list, carrying each driver's document tally so
 * a reviewer can see at a glance who is still incomplete.
 */
export const AdminUserSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
    role: z.string().nullable(),
    phoneNumber: z.string().nullable(),
    createdAt: z.string().describe('ISO-8601 timestamp'),
    documentCount: z.number().int().nonnegative(),
    pendingCount: z.number().int().nonnegative(),
    approvedCount: z.number().int().nonnegative(),
    /**
     * The verdict, which the counts above cannot give: they tally every
     * submission, while verification looks only at the two required types.
     */
    verification: DriverVerificationSchema,
  })
  .describe('AdminUser');
export type AdminUser = z.infer<typeof AdminUserSchema>;

export const AdminUserListSchema = z.array(AdminUserSchema).describe('AdminUserList');

export const AdminMismatchQuerySchema = z
  .object({
    status: z.enum(['open', 'resolved']).optional(),
  })
  .describe('AdminMismatchQuery');
export type AdminMismatchQuery = z.infer<typeof AdminMismatchQuerySchema>;

export const AdminPayoutQuerySchema = z
  .object({
    status: z.enum(['held', 'due', 'paid', 'cancelled', 'frozen']).optional(),
  })
  .describe('AdminPayoutQuery');
export type AdminPayoutQuery = z.infer<typeof AdminPayoutQuerySchema>;
