import {
  DOCUMENT_MAX_BYTES,
  DocumentMimeTypeSchema,
  type UpsertVehicle,
  type Vehicle,
} from '@carpool/schemas';
import { createApiClient } from '@carpool/api-client';
import { env } from './env';
import { ApiError } from './api-error';

/**
 * Vehicle data access — the single seam between the ride-creation "Étape 2"
 * screen and the API. Only ever used from client components, so the
 * browser-facing base URL is the right one (unlike `lib/trajets.ts`, which
 * also runs during SSR).
 */
const api = createApiClient(env.NEXT_PUBLIC_API_URL);

/** GET /vehicles/me — the signed-in driver's own vehicle, or null if none declared yet. */
export async function fetchMyVehicle(): Promise<Vehicle | null> {
  const res = await api.vehicles.me.$get();
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, 'Failed to load your vehicle');
  return res.json();
}

/** PUT /vehicles/me — declare or correct the driver's vehicle. */
export async function saveMyVehicle(vehicle: UpsertVehicle): Promise<Vehicle> {
  const res = await api.vehicles.me.$put({ json: vehicle });
  if (!res.ok) throw new ApiError(res.status, 'Failed to save your vehicle');
  return res.json();
}

/**
 * Upload an optional photo of the vehicle — same three-step handshake as a
 * driver document (signed URL → PUT the bytes → confirm), except the confirm
 * step attaches straight to `vehicle` rather than creating a reviewed
 * `driver_document` row: a car photo is never approved/rejected. Requires the
 * vehicle to already be saved (`saveMyVehicle` above) — the photo attaches to
 * an existing row rather than creating one.
 */
export async function uploadMyVehiclePhoto(file: File): Promise<Vehicle> {
  const mimeType = toSupportedMimeType(file);
  // Checked here as well as server-side so an oversized file fails instantly,
  // instead of after the browser has pushed several megabytes.
  if (file.size > DOCUMENT_MAX_BYTES) {
    throw new ApiError(413, 'File exceeds the maximum size');
  }

  const signed = await api.vehicles.me['photo-upload-url'].$post({
    json: { fileName: file.name, mimeType, sizeBytes: file.size },
  });
  if (!signed.ok) throw new ApiError(signed.status, 'Failed to prepare the upload');
  const { uploadUrl, storageKey } = await signed.json();

  const uploaded = await fetch(uploadUrl, { method: 'PUT', body: file });
  if (!uploaded.ok) throw new ApiError(uploaded.status, 'Upload failed');

  const confirmed = await api.vehicles.me.photo.$put({
    json: { storageKey, fileName: file.name, mimeType, sizeBytes: file.size },
  });
  if (!confirmed.ok) throw new ApiError(confirmed.status, 'Failed to attach the photo');
  return confirmed.json();
}

/**
 * GET /vehicle-photos/{ownerId} — a short-lived URL for a driver's vehicle
 * photo, or null when they have none. Public endpoint (no auth needed): this
 * is what a rider sees on a ride listing, not a reviewed identity document.
 */
export async function fetchVehiclePhotoUrl(ownerId: string): Promise<string | null> {
  const res = await api['vehicle-photos'][':ownerId'].$get({ param: { ownerId } });
  if (res.status === 404) return null;
  // The route declares only 200/404 (it's public, no 401 to speak of) — TS
  // already proves `res` can only be the 200 shape here, so there's no `!res.ok`
  // branch left to check.
  const { viewUrl } = await res.json();
  return viewUrl;
}

/**
 * Narrows a browser `File`'s MIME type down to the set the API accepts,
 * failing fast with a clear 415 rather than letting an unsupported type reach
 * the presign step only to be rejected a moment later anyway.
 */
function toSupportedMimeType(file: File) {
  const parsed = DocumentMimeTypeSchema.safeParse(file.type);
  if (!parsed.success) throw new ApiError(415, 'Unsupported file type');
  return parsed.data;
}
