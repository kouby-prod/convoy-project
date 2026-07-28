import { z } from 'zod';

/* ═══════════════════════════════════════════════════════════════════════════
   This module holds TWO related trajet contracts.

   1. `Trajet`        — what the API serves. Mirrors the `trajet` Drizzle table
                        plus the joined driver. Consumed by `apps/api` and the
                        typed RPC client.

   2. `TrajetListing` — the same ride re-shaped for the `/trajet` search and
                        detail UI (`arrivalCity`/`departureAt` rather than
                        `destinationCity`/`departureDateTime`). Produced by the
                        mapper in `apps/web/src/lib/trajets.ts`; nothing but
                        that seam builds one.

   Fields the platform cannot source yet (vehicle details, review scores) are
   nullable rather than stubbed with invented values — the UI hides them when
   null instead of showing a fake rating.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ──────────────────────────── Shared vocabulary ────────────────────────── */

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

/**
 * The driver as shown on a result row and on the ride detail page.
 *
 * `firstName`/`lastName` are derived from the account name. Everything below
 * them is nullable: the platform has no vehicle table and no reviews yet, so
 * the API returns null and the UI omits the block rather than inventing data.
 */
export const DriverProfileSchema = z
  .object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    /** Years since the driving licence was issued. */
    licenceYears: z.number().int().nonnegative().nullable(),
    carMake: z.string().nullable(),
    carModel: z.string().nullable(),
    carSeats: z.number().int().positive().nullable(),
    /** Average review score, 0–5. Rendered as the "Avis" stars. */
    rating: z.number().min(0).max(5).nullable(),
    reviewCount: z.number().int().nonnegative().nullable(),
  })
  .describe('DriverProfile');

export type DriverProfile = z.infer<typeof DriverProfileSchema>;

/* ─────────────────────────── 1. API / persisted ────────────────────────── */

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
    /** Pickup point within the departure city. */
    departurePlace: z.string().nullable(),
    /** Drop-off point within the destination city. */
    arrivalPlace: z.string().nullable(),
    /** Estimated arrival instant, ISO-8601. Null when the driver left it out. */
    arrivalDateTime: z.string().datetime().nullable(),
    seatsTotal: z.number().int().min(1),
    seatsAvailable: z.number().int().min(0),
    pricePerSeat: z.number().nonnegative(),
    description: z.string().max(1000).optional().nullable(),
    comfort: z.enum(['standard', 'confort', 'premium']).optional().nullable(),
    baggageAllowance: z.string().max(500).optional().nullable(),
    amenities: z.array(TrajetAmenitySchema),
    hasIntermediateStop: z.boolean(),
    driver: DriverProfileSchema,
    createdAt: z.string().describe('ISO-8601 timestamp'),
    updatedAt: z.string().describe('ISO-8601 timestamp'),
  })
  .describe('Trajet');
export type Trajet = z.infer<typeof TrajetSchema>;

/**
 * Publish payload. Everything below `pricePerSeat` is optional so a caller can
 * post a minimal ride; the `/trajet/nouveau` form supplies the lot.
 */
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
    departurePlace: z.string().max(200).optional().nullable(),
    arrivalPlace: z.string().max(200).optional().nullable(),
    arrivalDateTime: z.string().datetime().optional().nullable(),
    amenities: z.array(TrajetAmenitySchema).optional(),
    hasIntermediateStop: z.boolean().optional(),
  })
  .describe('CreateTrajet');
export type CreateTrajet = z.infer<typeof CreateTrajetSchema>;

export const TrajetListSchema = z.array(TrajetSchema).describe('TrajetList');

/**
 * Server-side search filters for `GET /trajets`. Everything is optional so a
 * bare `GET /trajets` returns the full list. Values arrive as URL strings, so
 * numbers are coerced and `amenities` accepts a repeated or comma-joined param.
 */
export const TrajetQuerySchema = z
  .object({
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    /** Calendar day, `YYYY-MM-DD`. */
    date: z.string().optional(),
    /** Earliest departure time on that day, `HH:MM`. */
    time: z.string().optional(),
    seats: z.coerce.number().int().min(1).max(8).optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    amenities: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((value) => {
        if (value === undefined) return [] as TrajetAmenity[];
        const raw = Array.isArray(value) ? value : value.split(',');
        return raw
          .map((entry) => entry.trim())
          .filter((entry): entry is TrajetAmenity =>
            (TRAJET_AMENITIES as readonly string[]).includes(entry),
          );
      }),
    stopPolicy: StopPolicySchema.optional().default('any'),
  })
  .describe('TrajetQuery');
export type TrajetQuery = z.infer<typeof TrajetQuerySchema>;

/**
 * Booking contract — a passenger reserving seats on a trajet. The passenger is
 * the authenticated user; the contact fields are what they typed on the ride
 * detail form and are stored alongside the reservation.
 */
export const CreateBookingSchema = z
  .object({
    seats: z.number().int().min(1),
    firstName: z.string().trim().max(100).optional().nullable(),
    lastName: z.string().trim().max(100).optional().nullable(),
    email: z.string().trim().max(200).optional().nullable(),
    phone: z.string().trim().max(50).optional().nullable(),
    message: z.string().trim().max(500).optional().nullable(),
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
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    message: z.string().nullable(),
    createdAt: z.string().describe('ISO-8601 timestamp'),
    updatedAt: z.string().describe('ISO-8601 timestamp'),
  })
  .describe('Booking');
export type Booking = z.infer<typeof BookingSchema>;

/* ─────────────────────────── 2. UI listing model ───────────────────────── */

/**
 * The search-result / detail shape rendered by the `/trajet` pages. Same ride
 * as `Trajet`, re-shaped for the UI: `arrivalCity` instead of
 * `destinationCity`, `departureAt` instead of `departureDateTime`, and places
 * collapsed to '' rather than null so the markup stays branch-free.
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
    /** ISO-8601 estimated arrival instant, or null when unknown. */
    arrivalAt: z.iso.datetime().nullable(),
    /** Price for one seat, in euros. */
    pricePerSeat: z.number().nonnegative(),
    seatsTotal: z.number().int().positive(),
    seatsAvailable: z.number().int().nonnegative(),
    amenities: z.array(TrajetAmenitySchema),
    hasIntermediateStop: z.boolean(),
    description: z.string(),
    /** Comfort tier and baggage policy — null when the driver left them out. */
    comfort: z.enum(['standard', 'confort', 'premium']).nullable(),
    baggageAllowance: z.string().nullable(),
    driver: DriverProfileSchema,
  })
  .describe('TrajetListing');

export type TrajetListing = z.infer<typeof TrajetListingSchema>;

/**
 * Search filters as held in the `/trajet` URL query string. Everything is
 * optional so `/trajet` with no query renders the full list.
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
    comfort: z.enum(['standard', 'confort', 'premium']).optional().nullable(),
    baggageAllowance: z.string().trim().max(500).optional().nullable(),
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
