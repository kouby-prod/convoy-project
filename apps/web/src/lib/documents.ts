import {
  DOCUMENT_MAX_BYTES,
  DocumentMimeTypeSchema,
  type DocumentMimeType,
  type DriverDocument,
  type DriverDocumentType,
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
