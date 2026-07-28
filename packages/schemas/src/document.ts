import { z } from 'zod';

/* ═══════════════════════════════════════════════════════════════════════════
   Driver identity documents — the contract behind the submission page
   (`/mes-documents`) and the backoffice review queue (`/admin`).

   The file bytes never travel through the API. A submission is a three-step
   handshake:

     1. POST /documents/upload-url  → the API signs a short-lived PUT URL
     2. PUT  <that URL>             → the BROWSER sends the bytes to the bucket
     3. POST /documents             → the API confirms the object landed and
                                      records the submission as `pending`

   Step 2 is why `storageKey` is part of the contract: it is the only thing
   tying the signed URL from step 1 to the row created in step 3.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ──────────────────────────── Shared vocabulary ────────────────────────── */

/**
 * What a driver has to provide before the platform trusts them. The values stay
 * in French because they are the legal names of the documents — the UI
 * translates them for display, it does not rename them.
 */
export const DRIVER_DOCUMENT_TYPES = [
  'permis',
  'carteIdentite',
  'carteGrise',
  'assurance',
] as const;

export const DriverDocumentTypeSchema = z
  .enum(DRIVER_DOCUMENT_TYPES)
  .describe('DriverDocumentType');
export type DriverDocumentType = z.infer<typeof DriverDocumentTypeSchema>;

/**
 * Review state. A submission starts `pending`; an admin moves it to `approved`
 * or `rejected`. There is no "resubmitted" state — re-uploading the same type
 * creates a new `pending` row, so the decision history stays auditable.
 */
export const DOCUMENT_STATUSES = ['pending', 'approved', 'rejected'] as const;

export const DocumentStatusSchema = z.enum(DOCUMENT_STATUSES).describe('DocumentStatus');
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

/**
 * Upload limits, shared so the browser can reject a bad file before spending a
 * round trip and the API can reject it again — the client check is a courtesy,
 * the server check is the rule.
 */
export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;

export const DOCUMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export const DocumentMimeTypeSchema = z.enum(DOCUMENT_MIME_TYPES).describe('DocumentMimeType');
export type DocumentMimeType = z.infer<typeof DocumentMimeTypeSchema>;

/* ─────────────────────────── The persisted record ──────────────────────── */

/**
 * A submitted document as the API serves it.
 *
 * `storageKey` is deliberately absent: clients reach the file through
 * `GET /documents/{id}/file`, which re-checks ownership and mints a fresh signed
 * URL. Handing out the raw key would let a link outlive the permission check.
 */
export const DriverDocumentSchema = z
  .object({
    id: z.string().uuid(),
    /** The driver who submitted it. */
    ownerId: z.string().min(1),
    type: DriverDocumentTypeSchema,
    status: DocumentStatusSchema,
    fileName: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int().nonnegative(),
    /** Expiry printed on the document (`YYYY-MM-DD`), when the driver gave one. */
    expiresOn: z.string().nullable(),
    /** The admin's reason — required on a rejection, so the driver knows what to fix. */
    reviewNote: z.string().nullable(),
    /** Admin account id + instant of the decision. Both null while pending. */
    reviewedBy: z.string().nullable(),
    reviewedAt: z.string().nullable(),
    submittedAt: z.string().describe('ISO-8601 timestamp'),
    updatedAt: z.string().describe('ISO-8601 timestamp'),
  })
  .describe('DriverDocument');
export type DriverDocument = z.infer<typeof DriverDocumentSchema>;

export const DriverDocumentListSchema = z
  .array(DriverDocumentSchema)
  .describe('DriverDocumentList');

/* ──────────────────────────── Step 1: sign a PUT ───────────────────────── */

/** What the browser declares about the file before it is allowed to upload. */
export const DocumentUploadUrlRequestSchema = z
  .object({
    type: DriverDocumentTypeSchema,
    fileName: z.string().trim().min(1).max(200),
    mimeType: DocumentMimeTypeSchema,
    sizeBytes: z.number().int().positive().max(DOCUMENT_MAX_BYTES),
  })
  .describe('DocumentUploadUrlRequest');
export type DocumentUploadUrlRequest = z.infer<typeof DocumentUploadUrlRequestSchema>;

/** The signed URL plus the key that step 3 has to quote back. */
export const DocumentUploadUrlSchema = z
  .object({
    /** Presigned PUT. Send the raw file as the body — no form encoding. */
    uploadUrl: z.string(),
    /** Namespaced to the caller (`documents/<userId>/…`) so keys are neither guessable nor claimable by anyone else. */
    storageKey: z.string(),
    expiresInSeconds: z.number().int().positive(),
  })
  .describe('DocumentUploadUrl');
export type DocumentUploadUrl = z.infer<typeof DocumentUploadUrlSchema>;

/* ──────────────────────── Step 3: record the submission ────────────────── */

export const CreateDocumentSchema = z
  .object({
    type: DriverDocumentTypeSchema,
    /** Exactly the `storageKey` returned by `POST /documents/upload-url`. */
    storageKey: z.string().min(1),
    fileName: z.string().trim().min(1).max(200),
    mimeType: DocumentMimeTypeSchema,
    sizeBytes: z.number().int().positive().max(DOCUMENT_MAX_BYTES),
    /** `YYYY-MM-DD`, optional — not every document carries an expiry date. */
    expiresOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
      .optional()
      .nullable(),
  })
  .describe('CreateDocument');
export type CreateDocument = z.infer<typeof CreateDocumentSchema>;

/* ───────────────────────────── Viewing the file ────────────────────────── */

/** A freshly signed, short-lived GET for one document. */
export const DocumentFileUrlSchema = z
  .object({
    viewUrl: z.string(),
    expiresInSeconds: z.number().int().positive(),
  })
  .describe('DocumentFileUrl');
export type DocumentFileUrl = z.infer<typeof DocumentFileUrlSchema>;
