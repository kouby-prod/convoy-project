import {
  DOCUMENT_MAX_BYTES,
  DocumentMimeTypeSchema,
  type DocumentMimeType,
  type DriverDocument,
  type DriverDocumentType,
  type DriverEligibility,
  type DriverNameDeclaration,
} from '@carpool/schemas';
import { createApiClient } from '@carpool/api-client';
import { env } from './env';
import { ApiError } from './api-error';

/**
 * Driver document data access — the single seam between `/mes-documents` and the
 * API. Everything goes through the typed RPC client, so the shapes below come
 * from the backend contract rather than being re-declared here.
 *
 * Only ever used from client components, so the browser-facing base URL is the
 * right one (unlike `lib/trajets.ts`, which also runs during SSR).
 */
const api = createApiClient(env.NEXT_PUBLIC_API_URL);

/** GET /documents/me — the signed-in driver's own submissions, newest first. */
export async function fetchMyDocuments(): Promise<DriverDocument[]> {
  const res = await api.documents.me.$get();
  if (!res.ok) throw new ApiError(res.status, 'Failed to load documents');
  return res.json();
}

/** GET /eligibility — the driver's declared date of birth, with the age derived. */
export async function fetchMyEligibility(): Promise<DriverEligibility> {
  const res = await api.eligibility.$get();
  if (!res.ok) throw new ApiError(res.status, 'Failed to load your eligibility details');
  return res.json();
}

/**
 * PUT /eligibility — declare the date of birth behind the minimum-age rule.
 *
 * The API refuses anything under `MIN_DRIVER_AGE` with a 400; the form checks
 * first so the driver is told before a round trip, but the server is the rule.
 */
export async function saveMyEligibility(dateOfBirth: string): Promise<DriverEligibility> {
  const res = await api.eligibility.$put({ json: { dateOfBirth } });
  if (!res.ok) throw new ApiError(res.status, 'Failed to save your date of birth');
  return res.json();
}

/**
 * PUT /eligibility/license-number — declare the number printed on the
 * driver's licence. Saved independently of `dateOfBirth` (separate route), so
 * this never wipes out a birth date already on file, or vice versa.
 */
export async function saveMyLicenseNumber(licenseNumber: string): Promise<DriverEligibility> {
  const res = await api.eligibility['license-number'].$put({ json: { licenseNumber } });
  if (!res.ok) throw new ApiError(res.status, 'Failed to save your licence number');
  return res.json();
}

/**
 * PUT /eligibility/name — declare the driver's legal first/last name, shown
 * next to the licence number on `/mes-documents`. Saved independently of
 * `dateOfBirth`/`licenseNumber` (separate route), so it never wipes out
 * either of those.
 */
export async function saveMyName(name: DriverNameDeclaration): Promise<DriverEligibility> {
  const res = await api.eligibility.name.$put({ json: name });
  if (!res.ok) throw new ApiError(res.status, 'Failed to save your name');
  return res.json();
}

/** GET /documents/:id/file — a short-lived URL to open one document. */
export async function fetchDocumentViewUrl(id: string): Promise<string> {
  const res = await api.documents[':id'].file.$get({ param: { id } });
  if (!res.ok) throw new ApiError(res.status, 'Failed to open the document');
  const { viewUrl } = await res.json();
  return viewUrl;
}

export interface DocumentSubmission {
  type: DriverDocumentType;
  file: File;
  /** `YYYY-MM-DD`, or empty when the document carries no expiry. */
  expiresOn?: string | null;
}

/**
 * Submit one document — the full three-step handshake, kept in one place so no
 * component has to know it is three requests:
 *
 *   1. ask the API to sign a slot,
 *   2. PUT the bytes straight to the bucket,
 *   3. tell the API the upload landed.
 *
 * Steps 1 and 3 carry the session; step 2 must NOT — it is a different origin
 * and the signature in the URL is its own authorisation.
 */
export async function submitDocument({
  type,
  file,
  expiresOn,
}: DocumentSubmission): Promise<DriverDocument> {
  const mimeType = toSupportedMimeType(file);
  // Checked here as well as server-side so an oversized file fails instantly,
  // instead of after the browser has pushed several megabytes.
  if (file.size > DOCUMENT_MAX_BYTES) {
    throw new ApiError(413, 'File exceeds the maximum size');
  }

  const signed = await api.documents['upload-url'].$post({
    json: { type, fileName: file.name, mimeType, sizeBytes: file.size },
  });
  if (!signed.ok) throw new ApiError(signed.status, 'Failed to prepare the upload');
  const { uploadUrl, storageKey } = await signed.json();

  const uploaded = await fetch(uploadUrl, { method: 'PUT', body: file });
  if (!uploaded.ok) throw new ApiError(uploaded.status, 'Upload failed');

  const created = await api.documents.$post({
    json: {
      type,
      storageKey,
      fileName: file.name,
      mimeType,
      sizeBytes: file.size,
      // '' from an untouched date field means "no expiry", not an empty date.
      expiresOn: expiresOn ? expiresOn : null,
    },
  });
  if (!created.ok) throw new ApiError(created.status, 'Failed to record the submission');
  return created.json();
}

/**
 * Narrow the browser-reported MIME type to one the contract accepts.
 *
 * Some browsers report an empty string for a file they cannot classify, so this
 * refuses rather than guessing from the extension — the API would reject it a
 * moment later anyway, and failing here gives a clearer message.
 */
function toSupportedMimeType(file: File): DocumentMimeType {
  const parsed = DocumentMimeTypeSchema.safeParse(file.type);
  if (!parsed.success) throw new ApiError(415, 'Unsupported file type');
  return parsed.data;
}
