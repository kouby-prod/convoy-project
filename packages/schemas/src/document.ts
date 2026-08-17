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
 * Every document type the system can store or render.
 *
 * The first three are what the platform asks for today. `carteIdentite` and
 * `carteGrise` are LEGACY: they are kept only so submissions made before the
 * eligibility rules were settled still render in a history list. Nothing asks
 * for them, and they do not count towards verification.
 *
 * `carteGrise` in particular was the wrong word for this market — the Canadian
 * equivalent is the vehicle registration, which is `immatriculation` below.
 */
export const DRIVER_DOCUMENT_TYPES = [
  'permis',
  'assurance',
  'immatriculation',
  'carteIdentite',
  'carteGrise',
] as const;

export const DriverDocumentTypeSchema = z
  .enum(DRIVER_DOCUMENT_TYPES)
  .describe('DriverDocumentType');
export type DriverDocumentType = z.infer<typeof DriverDocumentTypeSchema>;

/**
 * The documents a driver must get approved, one per documentary eligibility
 * condition:
 *
 *   permis         — holds a valid Canadian driver's licence
 *   assurance      — has valid auto insurance
 *   immatriculation — operates a compliant, roadworthy vehicle
 *
 * The fourth condition — being at least 18 — is not a document. It is checked
 * against the declared date of birth and confirmed by the reviewer against the
 * licence, which already carries it. See `DriverAgeCheckSchema` below.
 *
 * This is the one line to change if the required set ever changes; everything
 * downstream (the upload slots, the progress banner, the review queue chip) is
 * derived from it.
 */
export const REQUIRED_DRIVER_DOCUMENT_TYPES = [
  'permis',
  'assurance',
  'immatriculation',
] as const satisfies readonly DriverDocumentType[];
export type RequiredDriverDocumentType = (typeof REQUIRED_DRIVER_DOCUMENT_TYPES)[number];

/**
 * Review state. A submission starts `pending`; an admin moves it to `approved`
 * or `rejected`. There is no "resubmitted" state — re-uploading the same type
 * creates a new `pending` row, so the decision history stays auditable.
 */
export const DOCUMENT_STATUSES = ['pending', 'approved', 'rejected'] as const;

export const DocumentStatusSchema = z.enum(DOCUMENT_STATUSES).describe('DocumentStatus');
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

/**
 * A required document's state as a slot on screen — the three stored statuses
 * plus `missing` (nothing was ever sent) and `expired` (an approved licence
 * has gone past its re-verification window, see `PERMIS_REVERIFICATION_DAYS`
 * below). Neither is a `DocumentStatus` because nothing new is stored when a
 * slot ages out — it is derived at read time. Both the driver's slots and the
 * reviewer's progress chip need these cases, so they are named once here.
 */
export const DOCUMENT_SLOT_STATUSES = ['missing', ...DOCUMENT_STATUSES, 'expired'] as const;

export const DocumentSlotStatusSchema = z
  .enum(DOCUMENT_SLOT_STATUSES)
  .describe('DocumentSlotStatus');
export type DocumentSlotStatus = z.infer<typeof DocumentSlotStatusSchema>;

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

/* ─────────────────────── The age condition (not a file) ────────────────── */

/** Minimum driver age. The eligibility rules say "at least 18 years old". */
export const MIN_DRIVER_AGE = 18;

/** `YYYY-MM-DD`, the shape a `<input type="date">` and a Postgres `date` share. */
export const DateOfBirthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Not a real date')
  .describe('DateOfBirth');

/** What the driver declares. Kept separate from the documents: it is one field, not a file. */
export const EligibilityDeclarationSchema = z
  .object({ dateOfBirth: DateOfBirthSchema })
  .describe('EligibilityDeclaration');
export type EligibilityDeclaration = z.infer<typeof EligibilityDeclarationSchema>;

/** The stored declaration as the API serves it back. Null until the driver gives one. */
export const DriverEligibilitySchema = z
  .object({
    dateOfBirth: z.string().nullable(),
    /** Completed years, computed server-side so the UI never has to do date maths. */
    age: z.number().int().nonnegative().nullable(),
    isAdult: z.boolean(),
  })
  .describe('DriverEligibility');
export type DriverEligibility = z.infer<typeof DriverEligibilitySchema>;

/**
 * Completed years between a birth date and a moment.
 *
 * Compared as a (month, day) tuple rather than by dividing elapsed milliseconds:
 * years are not a fixed number of milliseconds, and on a leap year the naive
 * arithmetic turns an 18th birthday into 17.9997 years.
 */
export function ageOn(dateOfBirth: string, on: Date = new Date()): number {
  const born = new Date(`${dateOfBirth}T00:00:00Z`);
  let age = on.getUTCFullYear() - born.getUTCFullYear();
  const monthDelta = on.getUTCMonth() - born.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && on.getUTCDate() < born.getUTCDate())) age -= 1;
  return age;
}

/** Whether a declared birth date clears `MIN_DRIVER_AGE`. Null reads as "not yet declared". */
export function isOldEnoughToDrive(dateOfBirth: string | null, on: Date = new Date()): boolean {
  return dateOfBirth !== null && ageOn(dateOfBirth, on) >= MIN_DRIVER_AGE;
}

/**
 * The age condition's state.
 *
 * Two flags rather than one because they fail differently and are fixed by
 * different people: `isAdult` is the driver's declaration, `confirmedByReviewer`
 * is a human having checked that declaration against the birth date printed on
 * the licence. A declaration nobody verified is not a check.
 */
export const DriverAgeCheckSchema = z
  .object({
    dateOfBirth: z.string().nullable(),
    /** Completed years at the time the response was built. Null until declared. */
    age: z.number().int().nonnegative().nullable(),
    isAdult: z.boolean(),
    confirmedByReviewer: z.boolean(),
  })
  .describe('DriverAgeCheck');
export type DriverAgeCheck = z.infer<typeof DriverAgeCheckSchema>;

/* ────────────────────────── Overall verification ───────────────────────── */

/**
 * How long an approved licence stays trusted before a driver is asked to
 * re-verify it, counted from the reviewer's approval instant (`reviewedAt`),
 * not from submission. Applies only to `permis` — insurance and registration
 * have no re-verification window today.
 */
export const PERMIS_REVERIFICATION_DAYS = 365;
const PERMIS_REVERIFICATION_MS = PERMIS_REVERIFICATION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Where a driver stands, rolled up from the three required documents.
 *
 *   incomplete — at least one has never been sent
 *   pending    — everything sent, at least one still awaiting a decision
 *   rejected   — at least one came back refused; the driver has to resend it
 *   expired    — the licence was approved once but has passed its one-year
 *                re-verification window; the driver has to resend it
 *   approved   — all three accepted and fresh. The only state that means
 *                "verified" — this is what gates a ride's public visibility.
 */
export const DRIVER_VERIFICATION_STATUSES = [
  'incomplete',
  'pending',
  'rejected',
  'expired',
  'approved',
] as const;

export const DriverVerificationStatusSchema = z
  .enum(DRIVER_VERIFICATION_STATUSES)
  .describe('DriverVerificationStatus');
export type DriverVerificationStatus = z.infer<typeof DriverVerificationStatusSchema>;

/** One required document's latest state. */
export const DocumentSlotSchema = z
  .object({
    type: DriverDocumentTypeSchema,
    status: DocumentSlotStatusSchema,
  })
  .describe('DocumentSlot');
export type DocumentSlot = z.infer<typeof DocumentSlotSchema>;

export const DriverVerificationSchema = z
  .object({
    status: DriverVerificationStatusSchema,
    /** One entry per required type, in `REQUIRED_DRIVER_DOCUMENT_TYPES` order. */
    slots: z.array(DocumentSlotSchema),
    approvedCount: z.number().int().nonnegative(),
    requiredCount: z.number().int().positive(),
    /** The fourth eligibility condition, which no document slot covers. */
    age: DriverAgeCheckSchema,
  })
  .describe('DriverVerification');
export type DriverVerification = z.infer<typeof DriverVerificationSchema>;

/**
 * The minimum a row needs for the rollup below. Loose on purpose so it accepts
 * both a serialized `DriverDocument` (ISO strings) and a raw database row
 * (`Date`), rather than forcing one side to convert first.
 */
export interface VerifiableDocument {
  type: string;
  status: string;
  submittedAt: string | Date;
  /** Set on a licence when a reviewer confirmed the date of birth on it. */
  ageConfirmed?: boolean | null;
  /** Admin's approval instant. Drives the `permis` re-verification window. */
  reviewedAt?: string | Date | null;
}

/**
 * Roll a driver's submissions up into their verification state.
 *
 * Lives in the contract package because the driver's page and the backoffice
 * queue both display this and must never disagree about it — a slot the driver
 * sees as "approved" has to be the same one the reviewer counted.
 *
 * Only the NEWEST submission per type counts. Re-sending a refused document
 * inserts a new row rather than overwriting the old one, so the history keeps
 * the rejection while the rollup moves on.
 */
export function deriveDriverVerification(
  documents: readonly VerifiableDocument[],
  eligibility: { dateOfBirth?: string | null } = {},
  now: Date = new Date(),
): DriverVerification {
  const latest = new Map<string, VerifiableDocument>();
  for (const document of documents) {
    const current = latest.get(document.type);
    if (!current || toTime(document.submittedAt) > toTime(current.submittedAt)) {
      latest.set(document.type, document);
    }
  }

  const slots: DocumentSlot[] = REQUIRED_DRIVER_DOCUMENT_TYPES.map((type) => {
    const document = latest.get(type);
    const status = toSlotStatus(document?.status);
    // The one-year window applies only to `permis`, and only once it was
    // actually approved — a slot that is pending/rejected/missing has no
    // approval instant to measure from.
    if (type === 'permis' && status === 'approved' && isPermisStale(document, now)) {
      return { type, status: 'expired' as const };
    }
    return { type, status };
  });

  const approvedCount = slots.filter((slot) => slot.status === 'approved').length;

  const dateOfBirth = eligibility.dateOfBirth ?? null;
  const permis = latest.get('permis');
  const age: DriverAgeCheck = {
    dateOfBirth,
    age: dateOfBirth ? ageOn(dateOfBirth, now) : null,
    isAdult: isOldEnoughToDrive(dateOfBirth, now),
    // Only an APPROVED licence carries a confirmation worth trusting: the flag
    // is set as part of the approval, so a pending or refused one has not been
    // through that check.
    confirmedByReviewer: permis?.status === 'approved' && permis.ageConfirmed === true,
  };
  const ageSettled = age.isAdult && age.confirmedByReviewer;

  // Ordered by what has to happen next: a refusal is actionable and names its
  // reason, so it outranks something merely absent; an expired licence is
  // equally actionable (resend the same document) so it ranks alongside it,
  // and both outrank waiting. The age condition rides along with the
  // documents — all three approved but no confirmed birth date is still an
  // unfinished driver, not a verified one.
  const status: DriverVerificationStatus =
    approvedCount === slots.length && ageSettled
      ? 'approved'
      : slots.some((slot) => slot.status === 'rejected')
        ? 'rejected'
        : slots.some((slot) => slot.status === 'expired')
          ? 'expired'
          : slots.some((slot) => slot.status === 'missing') || dateOfBirth === null
            ? 'incomplete'
            : 'pending';

  return { status, slots, approvedCount, requiredCount: slots.length, age };
}

/** Whether an approved `permis` document has gone past its one-year window. */
function isPermisStale(document: VerifiableDocument | undefined, now: Date): boolean {
  if (!document?.reviewedAt) return false;
  return now.getTime() - toTime(document.reviewedAt) > PERMIS_REVERIFICATION_MS;
}

/**
 * The instant an approved `permis` stops counting as fresh, for display
 * ("valid until…"). Null when the licence was never approved.
 */
export function permisFreshUntil(reviewedAt: string | Date | null | undefined): string | null {
  if (!reviewedAt) return null;
  return new Date(toTime(reviewedAt) + PERMIS_REVERIFICATION_MS).toISOString();
}

function toTime(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/** An unknown or absent status reads as `missing` — never as a silent pass. */
function toSlotStatus(status: string | undefined): DocumentSlotStatus {
  const parsed = DocumentStatusSchema.safeParse(status);
  return parsed.success ? parsed.data : 'missing';
}

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
