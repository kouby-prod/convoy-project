import { z } from 'zod';

/**
 * Vehicle contract — the single source of truth for this entity.
 *
 * One vehicle per driver: `ownerId` is the primary key, so a correction
 * replaces the row instead of stacking up (a car's plate/colour is a fact,
 * not a submission — same reasoning as `driver_eligibility`). Proof of
 * registration (the scanned document) stays the separate `immatriculation`
 * upload in @carpool/schemas `document.ts`; this table only holds the
 * description a passenger sees on a ride.
 */
export const VehicleSchema = z
  .object({
    ownerId: z.string().min(1),
    make: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(100),
    color: z.string().trim().min(1).max(50),
    seats: z.number().int().min(1).max(8),
    /** Plate number as printed on the registration. */
    plate: z.string().trim().min(1).max(20),
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
}).describe('UpsertVehicle');
export type UpsertVehicle = z.infer<typeof UpsertVehicleSchema>;
