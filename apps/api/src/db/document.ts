import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, integer, date, index, boolean } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

/**
 * `driver_document` — one row per submitted identity document.
 *
 * The file itself lives in object storage; this table holds only the metadata
 * and the review decision. `storageKey` is the bucket key and never leaves the
 * API: callers fetch the file through `GET /documents/{id}/file`, which
 * re-checks permission and signs a fresh short-lived URL.
 *
 * Re-submitting a type inserts a NEW row rather than overwriting the old one,
 * so a rejection and its reason stay on the record.
 *
 * After editing the columns, regenerate + apply the migration:
 * `pnpm --filter @carpool/api db:generate` then `db:migrate`.
 * Do not hand-edit auth-schema.ts (it is BetterAuth CLI-generated).
 */
export const driverDocument = pgTable(
  'driver_document',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The driver who submitted it. Deleting the account removes the documents. */
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** A `DriverDocumentType` value. */
    type: text('type').notNull(),
    /** A `DocumentStatus` value — every submission starts `pending`. */
    status: text('status').notNull().default('pending'),
    /** Bucket key, `documents/<ownerId>/<uuid>-<file>`. API-internal. */
    storageKey: text('storage_key').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    /** Expiry printed on the document. `date` gives back a plain `YYYY-MM-DD`. */
    expiresOn: date('expires_on'),
    /** Why it was rejected. Required on rejection (enforced by ReviewDocumentSchema). */
    reviewNote: text('review_note'),
    /**
     * Only meaningful on a `permis` row: the reviewer confirmed the driver's
     * declared birth date against the one printed on the licence. This is the
     * record that eligibility condition 4 was actually checked by a human, as
     * opposed to merely declared by the driver.
     */
    ageConfirmed: boolean('age_confirmed').notNull().default(false),
    /** The reviewing admin. `set null` keeps the decision if that admin is deleted. */
    reviewedBy: text('reviewed_by').references(() => user.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // The two hot reads: a driver's own list, and the backoffice queue filtered
  // by status.
  (t) => [
    index('driver_document_owner_idx').on(t.ownerId),
    index('driver_document_status_idx').on(t.status),
  ],
);

/** Two links to `user`, so both carry an explicit name to stay unambiguous. */
export const driverDocumentRelations = relations(driverDocument, ({ one }) => ({
  owner: one(user, {
    fields: [driverDocument.ownerId],
    references: [user.id],
    relationName: 'documentOwner',
  }),
  reviewer: one(user, {
    fields: [driverDocument.reviewedBy],
    references: [user.id],
    relationName: 'documentReviewer',
  }),
}));
