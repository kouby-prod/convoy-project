import type { DocumentStatus, DriverDocument, DriverDocumentType } from '@carpool/schemas';
import type { driverDocument } from '../../db/document';

/**
 * DB row → the `DriverDocument` contract shape.
 *
 * Lives in its own file because the backoffice serves the same document with an
 * `owner` attached; both modules map through this one function so the driver
 * and the reviewer can never drift into seeing different shapes of the same row.
 *
 * `storageKey` is intentionally dropped — see the note on `DriverDocumentSchema`.
 * `type` and `status` are cast: Postgres stores them as `text`, and the enum
 * lives in the Zod contract rather than in the column.
 */
export function serializeDocument(row: typeof driverDocument.$inferSelect): DriverDocument {
  return {
    id: row.id,
    ownerId: row.ownerId,
    type: row.type as DriverDocumentType,
    status: row.status as DocumentStatus,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    expiresOn: row.expiresOn,
    reviewNote: row.reviewNote,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    submittedAt: row.submittedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
