import { z } from 'zod';

/* ═══════════════════════════════════════════════════════════════════════════
   This module holds TWO related but distinct trajet contracts. They are not
   interchangeable, and the names are deliberately different so a mix-up is a
   compile error rather than a runtime surprise.

   1. `Trajet`        — the persisted entity. Mirrors the `trajet` Drizzle
                        table and is what the API actually serves. Consumed by
                        `apps/api` and the typed RPC client.

   2. `TrajetListing` — the richer search/detail model the web UI renders
                        (nested driver profile, amenities, arrival leg). Backed
                        by fixtures in `apps/web/src/lib/trajets.ts` until the
                        API grows the matching columns.

   When the API catches up, `TrajetListing` should collapse into `Trajet`.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────── 1. Persisted entity ───────────────────── */

/**
 * Trajet contract — the single source of truth for this entity.
 * Defined once here in @carpool/schemas and consumed by the API routes and the
 * typed RPC client. Changing a shape below produces type errors everywhere it
 * is used until each consumer is updated (the contract spine).
 */
export const TrajetSchema = z
  .object({
    id: z.string().uuid(),
    driverId: z.string().min(1),
    departureCity: z.string().min(1),
    destinationCity: z.string().min(1),
    departureDateTime: z.string().datetime(),
    seatsTotal: z.number().int().min(1),
    seatsAvailable: z.number().int().min(0),
    pricePerSeat: z.number().nonnegative(),
    description: z.string().max(1000).optional().nullable(),
    comfort: z.enum(['standard', 'confort', 'premium']).optional().nullable(),
    baggageAllowance: z.string().max(500).optional().nullable(),
    createdAt: z.string().describe('ISO-8601 timestamp'),
    updatedAt: z.string().describe('ISO-8601 timestamp'),
  })
  .describe('Trajet');
export type Trajet = z.infer<typeof TrajetSchema>;

export const CreateTrajetSchema = z
  .object({
    departureCity: z.string().min(1),
    destinationCity: z.string().min(1),
    departureDateTime: z.string().datetime(),
    seatsTotal: z.number().int().min(1),
    pricePerSeat: z.number().nonnegative(),
    description: z.string().max(1000).optional().nullable(),
    comfort: z.enum(['standard', 'confort', 'premium']).optional().nullable(),
    baggageAllowance: z.string().max(500).optional().nullable(),
  })
  .describe('CreateTrajet');
export type CreateTrajet = z.infer<typeof CreateTrajetSchema>;

export const TrajetListSchema = z.array(TrajetSchema).describe('TrajetList');

/**
 * Booking contract — a passenger reserving seats on a trajet.
 */
export const CreateBookingSchema = z
  .object({
    seats: z.number().int().min(1),
  })
  .describe('CreateBooking');
export type CreateBooking = z.infer<typeof CreateBookingSchema>;

export const BookingSchema = z
  .object({
    id: z.string(),
    trajetId: z.string(),
    passengerId: z.string(),
    seats: z.number().int().min(1),
    status: z.string(),
    createdAt: z.string().describe('ISO-8601 timestamp'),
    updatedAt: z.string().describe('ISO-8601 timestamp'),
  })
  .describe('Booking');
export type Booking = z.infer<typeof BookingSchema>;

/* ─────────────────────────── 2. UI listing model ───────────────────────── */

/**
 * Options a driver advertises on a ride. Positive and negative variants both
 * exist (`pets` vs `noPets`) because the search filter offers them as separate
 * toggles — "no pets" is a promise to allergic passengers, not just the absence
 * of "pets".
 */
export const TRAJET_AMENITIES = [
  'smoking',
  'nonSmoking',
  'pets',
  'noPets',
  'skiRack',
  'luggage',
  'handLuggage',
  'insurance',
  'bikeRack',
  'cardPayment',
] as const;

export const TrajetAmenitySchema = z.enum(TRAJET_AMENITIES).describe('TrajetAmenity');
export type TrajetAmenity = z.infer<typeof TrajetAmenitySchema>;

/** Whether the ride runs straight through or picks up along the way. */
export const StopPolicySchema = z.enum(['any', 'direct', 'withStops']).describe('StopPolicy');
export type StopPolicy = z.infer<typeof StopPolicySchema>;

/** The driver as shown on a result row and on the ride detail page. */
export const DriverProfileSchema = z
  .object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    /** Years since the driving licence was issued. */
    licenceYears: z.number().int().nonnegative(),
    carMake: z.string(),
    carModel: z.string(),
    carSeats: z.number().int().positive(),
    /** Average review score, 0–5. Rendered as the "Avis" stars. */
    rating: z.number().min(0).max(5),
    reviewCount: z.number().int().nonnegative(),
  })
  .describe('DriverProfile');

export type DriverProfile = z.infer<typeof DriverProfileSchema>;

/**
 * The search-result / detail shape rendered by the `/trajet` pages. Richer than
 * the persisted `Trajet` above: it carries the arrival leg, the amenity list
 * and the embedded driver profile that the UI needs but the table does not yet
 * store.
 */
export const TrajetListingSchema = z
  .object({
    id: z.string(),
    departureCity: z.string(),
    departurePlace: z.string(),
    arrivalCity: z.string(),
    arrivalPlace: z.string(),
    /** ISO-8601 departure instant. */
    departureAt: z.iso.datetime(),
    /** ISO-8601 estimated arrival instant. */
    arrivalAt: z.iso.datetime(),
    /** Price for one seat, in euros. */
    pricePerSeat: z.number().nonnegative(),
    seatsTotal: z.number().int().positive(),
    seatsAvailable: z.number().int().nonnegative(),
    amenities: z.array(TrajetAmenitySchema),
    hasIntermediateStop: z.boolean(),
    description: z.string(),
    driver: DriverProfileSchema,
  })
  .describe('TrajetListing');

export type TrajetListing = z.infer<typeof TrajetListingSchema>;

/**
 * Search filters. Everything is optional so `/trajet` with no query renders the
 * full list. Numbers are coerced because the values arrive as URL strings.
 */
export const TrajetSearchQuerySchema = z
  .object({
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    /** Calendar day, `YYYY-MM-DD`. */
    date: z.string().optional(),
    /** Earliest departure time on that day, `HH:MM`. */
    time: z.string().optional(),
    seats: z.coerce.number().int().min(1).max(8).optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    amenities: z.array(TrajetAmenitySchema).default([]),
    stopPolicy: StopPolicySchema.default('any'),
  })
  .describe('TrajetSearchQuery');

export type TrajetSearchQuery = z.infer<typeof TrajetSearchQuerySchema>;

/** Payload for publishing a ride (`/trajet/nouveau`). */
export const CreateTrajetRequestSchema = z
  .object({
    departureCity: z.string().trim().min(1),
    departurePlace: z.string().trim().min(1),
    arrivalCity: z.string().trim().min(1),
    arrivalPlace: z.string().trim().min(1),
    departureAt: z.iso.datetime(),
    arrivalAt: z.iso.datetime(),
    pricePerSeat: z.number().nonnegative(),
    seatsTotal: z.number().int().min(1).max(8),
    amenities: z.array(TrajetAmenitySchema).default([]),
    hasIntermediateStop: z.boolean().default(false),
    description: z.string().trim().max(500).default(''),
  })
  .describe('CreateTrajetRequest');

export type CreateTrajetRequest = z.infer<typeof CreateTrajetRequestSchema>;

/** Payload for the booking form on the ride detail page. */
export const CreateBookingRequestSchema = z
  .object({
    trajetId: z.string().min(1),
    lastName: z.string().trim().min(1),
    firstName: z.string().trim().min(1),
    email: z.email(),
    phone: z.string().trim().min(6),
    message: z.string().trim().max(500).default(''),
  })
  .describe('CreateBookingRequest');

export type CreateBookingRequest = z.infer<typeof CreateBookingRequestSchema>;
