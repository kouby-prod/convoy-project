import { z } from 'zod';
import { DOCUMENT_MAX_BYTES, DocumentMimeTypeSchema } from './document';

/**
 * Vehicle contract — the single source of truth for this entity.
 *
 * One vehicle per driver: `ownerId` is the primary key, so a correction
 * replaces the row instead of stacking up (a car's plate/colour is a fact,
 * not a submission — same reasoning as `driver_eligibility`). `plate` is the
 * only mandatory field — it alone satisfies registration, no scanned document
 * asked for. `make`/`model`/`color`/`seats` are optional: the UI omits
 * whichever ones are still null rather than showing invented data. Insurance
 * is self-certified the same way: `hasInsurance` is the driver's own "yes/no"
 * declaration, not a reviewed upload (there is no `driver_document` row for
 * any of this — see `document.ts`'s `REQUIRED_DRIVER_DOCUMENT_TYPES`).
 */
export const VehicleSchema = z
  .object({
    ownerId: z.string().min(1),
    make: z.string().trim().min(1).max(100).nullable(),
    model: z.string().trim().min(1).max(100).nullable(),
    color: z.string().trim().min(1).max(50).nullable(),
    seats: z.number().int().min(1).max(8).nullable(),
    /** Plate number as printed on the registration — this alone satisfies "immatriculation". */
    plate: z.string().trim().min(1).max(20),
    /**
     * The driver's own "yes/no" declaration of holding valid auto insurance —
     * self-certified, not a reviewed document. Null until they answer the
     * question on the ride-creation "Étape 4" screen.
     */
    hasInsurance: z.boolean().nullable(),
    /**
     * Whether an optional car photo is on file. The storage key itself is
     * never served (same reasoning as a driver document) — a fresh signed URL
     * is minted on demand instead, see `getVehiclePhotoRoute`.
     */
    hasPhoto: z.boolean(),
    createdAt: z.string().describe('ISO-8601 timestamp'),
    updatedAt: z.string().describe('ISO-8601 timestamp'),
  })
  .describe('Vehicle');
export type Vehicle = z.infer<typeof VehicleSchema>;

/** Payload to declare or correct the driver's vehicle (`PUT /vehicles/me`). */
export const UpsertVehicleSchema = VehicleSchema.pick({
  make: true,
  model: true,
  color: true,
  seats: true,
  plate: true,
  hasInsurance: true,
}).describe('UpsertVehicle');
export type UpsertVehicle = z.infer<typeof UpsertVehicleSchema>;

/* ─────────────────────── Optional vehicle photo upload ─────────────────────
   Same three-step handshake as a driver document (upload-url → PUT the bytes
   → confirm), reusing the same MIME/size limits, but stored on `vehicle`
   directly rather than in `driver_document` — a car photo is never reviewed,
   so it has no business in the admin queue. */

/** Step 1: get a presigned PUT URL for the photo. */
export const VehiclePhotoUploadUrlRequestSchema = z
  .object({
    fileName: z.string().trim().min(1).max(200),
    mimeType: DocumentMimeTypeSchema,
    sizeBytes: z.number().int().positive().max(DOCUMENT_MAX_BYTES),
  })
  .describe('VehiclePhotoUploadUrlRequest');
export type VehiclePhotoUploadUrlRequest = z.infer<typeof VehiclePhotoUploadUrlRequestSchema>;

/** The signed URL plus the key step 3 has to quote back. */
export const VehiclePhotoUploadUrlSchema = z
  .object({
    uploadUrl: z.string(),
    storageKey: z.string(),
    expiresInSeconds: z.number().int().positive(),
  })
  .describe('VehiclePhotoUploadUrl');
export type VehiclePhotoUploadUrl = z.infer<typeof VehiclePhotoUploadUrlSchema>;

/** Step 3: record the upload against the driver's vehicle. */
export const ConfirmVehiclePhotoSchema = z
  .object({
    storageKey: z.string().min(1),
    fileName: z.string().trim().min(1).max(200),
    mimeType: DocumentMimeTypeSchema,
    sizeBytes: z.number().int().positive().max(DOCUMENT_MAX_BYTES),
  })
  .describe('ConfirmVehiclePhoto');
export type ConfirmVehiclePhoto = z.infer<typeof ConfirmVehiclePhotoSchema>;

/** A freshly signed, short-lived GET for the vehicle's photo. */
export const VehiclePhotoUrlSchema = z
  .object({
    viewUrl: z.string(),
    expiresInSeconds: z.number().int().positive(),
  })
  .describe('VehiclePhotoUrl');
export type VehiclePhotoUrl = z.infer<typeof VehiclePhotoUrlSchema>;
