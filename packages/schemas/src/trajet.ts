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

   Fields the platform cannot source yet (vehicle details) are nullable rather
   than stubbed with invented values — the UI hides them when null instead of
   showing fake data.
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
  'cashOrInterac',
] as const;

export const TrajetAmenitySchema = z.enum(TRAJET_AMENITIES).describe('TrajetAmenity');
export type TrajetAmenity = z.infer<typeof TrajetAmenitySchema>;

/**
 * How the passenger pays the **ride fare**. Kouby's 4 CAD commission is always
 * collected on-platform. `card` also collects the fare through Stripe/PayPal;
 * `interac` and `cash` leave the fare between passenger and driver.
 */
export const RIDE_PAYMENT_METHODS = ['card', 'interac', 'cash'] as const;
export const RidePaymentMethodSchema = z.enum(RIDE_PAYMENT_METHODS).describe('RidePaymentMethod');
export type RidePaymentMethod = z.infer<typeof RidePaymentMethodSchema>;

export const RidePaymentMethodsSchema = z
  .array(RidePaymentMethodSchema)
  .min(1)
  .refine((methods) => new Set(methods).size === methods.length, {
    message: 'paymentMethods must not contain duplicates',
  })
  .describe('RidePaymentMethods');

/**
 * Decorative payment-method amenities kept for existing ride rows. New rides
 * use `paymentMethods` (card / Interac / cash) for actual fare collection.
 */
export const PAYMENT_AMENITIES = ['cardPayment', 'cashOrInterac'] as const satisfies readonly TrajetAmenity[];
export type PaymentAmenity = (typeof PAYMENT_AMENITIES)[number];

/** Whether the ride runs straight through or picks up along the way. */
export const StopPolicySchema = z.enum(['any', 'direct', 'withStops']).describe('StopPolicy');
export type StopPolicy = z.infer<typeof StopPolicySchema>;

/**
 * The driver as shown on a result row and on the ride detail page.
 *
 * `firstName`/`lastName` are derived from the account name. Everything below
 * them is nullable: the platform has no vehicle table yet, so the API returns
 * null and the UI omits the block rather than inventing data. `rating`/
 * `reviewCount` are null when the driver has no `passenger_to_driver` reviews.
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
    /**
     * Whether the driver's permis/assurance/immatriculation are all
     * `approved` (and, for permis, still within its one-year re-verification
     * window) — same rollup as `deriveDriverVerification(...).status ===
     * 'approved'`. Drives the "Vérifié"/"Non vérifié" badge; it does NOT gate
     * whether the ride shows up in search — an unverified driver's rides are
     * still publicly listed, just badged accordingly.
     */
    verified: z.boolean(),
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
    // Geocoded server-side from the city names (best-effort, async — see
    // geocodeAndStoreTrajetLocation in apps/api/src/modules/trajet/geocoding.ts).
    // Null until that background job resolves, or forever if geocoding failed.
    departureLat: z.number().min(-90).max(90).nullable(),
    departureLng: z.number().min(-180).max(180).nullable(),
    arrivalLat: z.number().min(-90).max(90).nullable(),
    arrivalLng: z.number().min(-180).max(180).nullable(),
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
    /** Advertised options. */
    amenities: z.array(TrajetAmenitySchema),
    /** Methods the driver accepts for the ride fare. */
    paymentMethods: RidePaymentMethodsSchema,
    hasIntermediateStop: z.boolean(),
    driver: DriverProfileSchema,
    cancelledAt: z.string().nullable().describe('ISO-8601 timestamp, null while the trajet is active'),
    createdAt: z.string().describe('ISO-8601 timestamp'),
    updatedAt: z.string().describe('ISO-8601 timestamp'),
  })
  .describe('Trajet');
export type Trajet = z.infer<typeof TrajetSchema>;

export const CreateTrajetSchema = z
  .object({
    departureCity: z.string().min(1),
    destinationCity: z.string().min(1),
    // Client-supplied when the driver used the location picker (see
    // apps/web's LocationPicker); left out otherwise, in which case the API
    // falls back to a best-effort city-level geocode (see
    // geocodeAndStoreTrajetLocation in apps/api/src/modules/trajet/geocoding.ts).
    departureLat: z.number().min(-90).max(90).nullable().optional(),
    departureLng: z.number().min(-180).max(180).nullable().optional(),
    arrivalLat: z.number().min(-90).max(90).nullable().optional(),
    arrivalLng: z.number().min(-180).max(180).nullable().optional(),
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
    paymentMethods: RidePaymentMethodsSchema,
    hasIntermediateStop: z.boolean().optional(),
  })
  .refine((data) => new Date(data.departureDateTime).getTime() > Date.now(), {
    message: 'departureDateTime must be in the future',
    path: ['departureDateTime'],
  })
  .describe('CreateTrajet');
export type CreateTrajet = z.infer<typeof CreateTrajetSchema>;

/**
 * Driver-only partial update of a published trajet (PATCH /trajets/:id).
 * Every field is optional — an absent field is left unchanged. `seatsTotal`
 * is still validated against already-booked seats, but only the API can
 * check that (it needs the current `seatsAvailable`), not this schema.
 */
export const UpdateTrajetSchema = z
  .object({
    departureCity: z.string().min(1).optional(),
    destinationCity: z.string().min(1).optional(),
    // Same as CreateTrajetSchema: supplied when the driver re-picked a
    // location, absent otherwise.
    departureLat: z.number().min(-90).max(90).nullable().optional(),
    departureLng: z.number().min(-180).max(180).nullable().optional(),
    arrivalLat: z.number().min(-90).max(90).nullable().optional(),
    arrivalLng: z.number().min(-180).max(180).nullable().optional(),
    departureDateTime: z.string().datetime().optional(),
    seatsTotal: z.number().int().min(1).optional(),
    pricePerSeat: z.number().nonnegative().optional(),
    description: z.string().max(1000).optional().nullable(),
    comfort: z.enum(['standard', 'confort', 'premium']).optional().nullable(),
    baggageAllowance: z.string().max(500).optional().nullable(),
    departurePlace: z.string().max(200).optional().nullable(),
    arrivalPlace: z.string().max(200).optional().nullable(),
    arrivalDateTime: z.string().datetime().optional().nullable(),
    amenities: z.array(TrajetAmenitySchema).optional(),
    paymentMethods: RidePaymentMethodsSchema.optional(),
    hasIntermediateStop: z.boolean().optional(),
  })
  .refine(
    (data) => data.departureDateTime === undefined || new Date(data.departureDateTime).getTime() > Date.now(),
    {
      message: 'departureDateTime must be in the future',
      path: ['departureDateTime'],
    },
  )
  .describe('UpdateTrajet');
export type UpdateTrajet = z.infer<typeof UpdateTrajetSchema>;

/**
 * Shared page/limit query params for every paginated list endpoint.
 * `limit` is capped at 100 to keep a single page bounded regardless of what
 * a caller requests.
 */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/**
 * Envelope for a paginated list response. `hasMore` (rather than a total
 * count) is enough to drive prev/next paging without an extra COUNT(*)
 * query per request. Exported so other schema files (e.g. review.ts) can
 * build their own page schemas without duplicating this shape.
 */
export function paginatedSchema<Item extends z.ZodTypeAny>(itemSchema: Item) {
  return z.object({
    items: z.array(itemSchema),
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    hasMore: z.boolean(),
  });
}

export const TrajetPageSchema = paginatedSchema(TrajetSchema).describe('TrajetPage');

/**
 * A driver's own ride on `GET /me/trajets`. Same as `Trajet`. Count fields
 * stay on the contract at zero — drivers are not shown unpaid holds or
 * leftover accept/reject queues.
 */
export const OwnedTrajetSchema = TrajetSchema.extend({
  pendingRequestCount: z.number().int().nonnegative(),
  awaitingPaymentCount: z.number().int().nonnegative(),
}).describe('OwnedTrajet');
export type OwnedTrajet = z.infer<typeof OwnedTrajetSchema>;

export const OwnedTrajetPageSchema = paginatedSchema(OwnedTrajetSchema).describe('OwnedTrajetPage');

/**
 * A trajet as returned by search, with the driver's rating summary (also
 * available at `driver.rating`/`driver.reviewCount` — kept top-level too for
 * backward compatibility) and (when `nearLat`/`nearLng` were part of the
 * query) the departure point's distance from that reference point attached,
 * so the results list doesn't need a second fetch per row. `distanceKm` is
 * null when there's no `nearLat`+`nearLng` in the query.
 */
export const TrajetSearchResultSchema = TrajetSchema.extend({
  driverRating: z.number().min(1).max(5).nullable(),
  driverReviewCount: z.number().int().min(0),
  distanceKm: z.number().nonnegative().nullable(),
}).describe('TrajetSearchResult');
export type TrajetSearchResult = z.infer<typeof TrajetSearchResultSchema>;

export const TrajetSearchPageSchema = paginatedSchema(TrajetSearchResultSchema).describe('TrajetSearchPage');

/**
 * Search/filter query for `GET /trajets`. Every filter field is optional and
 * additive (AND-combined) — an absent field applies no filter.
 * `departureCity`/`destinationCity`/`baggageAllowance` are case-insensitive
 * substring matches; `date` matches trajets departing on that calendar day
 * (or from `time` onward on that day, when `time` is also given);
 * `minDriverRating` keeps only trajets whose driver's average rating (across
 * their `passenger_to_driver` reviews) is at least that value — drivers with
 * no reviews yet never match a `minDriverRating` filter. `amenities` keeps
 * only trajets advertising every listed amenity; `stopPolicy` narrows to
 * direct rides or rides with a stop (`any` applies no filter).
 * `nearLat`/`nearLng` (a passenger's own location, e.g. from the browser's
 * geolocation API) must be provided together; results are then sorted by
 * distance from that point to the trajet's departure point, and trajets
 * whose departure was never successfully geocoded never match. `radiusKm`
 * additionally excludes anything farther than that — it's ignored if
 * `nearLat`/`nearLng` are absent.
 */
export const TrajetApiSearchQuerySchema = z
  .object({
    departureCity: z.string().min(1).optional(),
    destinationCity: z.string().min(1).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('YYYY-MM-DD'),
    /** Earliest departure time on `date`, `HH:MM`. Ignored without `date`. */
    time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .describe('HH:MM'),
    minSeats: z.coerce.number().int().min(1).optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    comfort: z.enum(['standard', 'confort', 'premium']).optional(),
    baggageAllowance: z.string().min(1).optional(),
    minDriverRating: z.coerce.number().min(1).max(5).optional(),
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
    nearLat: z.coerce.number().min(-90).max(90).optional(),
    nearLng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().positive().max(20000).optional(),
  })
  .extend(PaginationQuerySchema.shape)
  .refine((data) => (data.nearLat === undefined) === (data.nearLng === undefined), {
    message: 'nearLat and nearLng must be provided together',
    path: ['nearLat'],
  })
  .describe('TrajetApiSearchQuery');
export type TrajetApiSearchQuery = z.infer<typeof TrajetApiSearchQuerySchema>;

/**
 * Booking contract — a passenger reserving seats on a trajet. The passenger is
 * the authenticated user; the contact fields are what they typed on the ride
 * detail form and are stored alongside the reservation for the driver to see.
 * A booking starts `awaiting_payment` (seats held, Kouby invoice issued) and:
 * - Stripe/PayPal settlement moves `awaiting_payment` → `confirmed`,
 * - the passenger moves it to `cancelled` (POST .../cancel), or
 * - the system moves it to `expired` (unpaid invoice TTL, 5 minutes).
 * Legacy `pending` rows can still be accepted/rejected via
 * `UpdateBookingStatusSchema` (`confirmed` still means "I accept").
 */
export const CreateBookingSchema = z
  .object({
    seats: z.number().int().min(1),
    paymentMethod: RidePaymentMethodSchema,
    firstName: z.string().trim().max(100).optional().nullable(),
    lastName: z.string().trim().max(100).optional().nullable(),
    email: z.string().trim().max(200).optional().nullable(),
    phone: z.string().trim().max(50).optional().nullable(),
    message: z.string().trim().max(500).optional().nullable(),
  })
  .describe('CreateBooking');
export type CreateBooking = z.infer<typeof CreateBookingSchema>;

export const BookingStatusSchema = z.enum([
  'pending',
  'awaiting_payment',
  'confirmed',
  'rejected',
  'cancelled',
  'expired',
]);
export type BookingStatus = z.infer<typeof BookingStatusSchema>;

export const BookingSchema = z
  .object({
    id: z.string(),
    trajetId: z.string(),
    passengerId: z.string(),
    seats: z.number().int().min(1),
    status: BookingStatusSchema,
    paymentMethod: RidePaymentMethodSchema,
    fareCents: z.number().int().nonnegative(),
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

export const BookingPageSchema = paginatedSchema(BookingSchema).describe('BookingPage');

/**
 * Trip summary embedded in `BookingWithTrajetSchema` — just enough for a
 * passenger's "my bookings" list to be useful without a second fetch per row.
 */
export const BookingTrajetSummarySchema = z
  .object({
    departureCity: z.string(),
    destinationCity: z.string(),
    departureDateTime: z.string(),
    pricePerSeat: z.number(),
    /** Pickup point within the city. Absent on older checkout payloads. */
    departurePlace: z.string().nullable().optional(),
    arrivalPlace: z.string().nullable().optional(),
    driverFirstName: z.string().optional(),
    driverLastName: z.string().optional(),
  })
  .describe('BookingTrajetSummary');

export const BookingWithTrajetSchema = BookingSchema.extend({
  trajet: BookingTrajetSummarySchema,
  invoiceDueAt: z
    .string()
    .nullable()
    .describe('ISO-8601 due date of the issued invoice, if any'),
  invoiceTotalCents: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe('Issued invoice total in cents, if any'),
  reviewedByPassenger: z
    .boolean()
    .describe('True when this passenger already left a passenger_to_driver review'),
}).describe('BookingWithTrajet');
export type BookingWithTrajet = z.infer<typeof BookingWithTrajetSchema>;

export const BookingWithTrajetPageSchema = paginatedSchema(BookingWithTrajetSchema).describe(
  'BookingWithTrajetPage',
);

/**
 * Driver-only action on a leftover `pending` booking (instant book is the
 * default; this remains for rows created before that change).
 */
export const UpdateBookingStatusSchema = z
  .object({
    status: z.enum(['confirmed', 'rejected']),
  })
  .describe('UpdateBookingStatus');
export type UpdateBookingStatus = z.infer<typeof UpdateBookingStatusSchema>;

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
    departureLat: z.number().min(-90).max(90).nullable(),
    departureLng: z.number().min(-180).max(180).nullable(),
    arrivalLat: z.number().min(-90).max(90).nullable(),
    arrivalLng: z.number().min(-180).max(180).nullable(),
    /** ISO-8601 departure instant. */
    departureAt: z.iso.datetime(),
    /** ISO-8601 estimated arrival instant, or null when unknown. */
    arrivalAt: z.iso.datetime().nullable(),
    /** Price for one seat, in euros. */
    pricePerSeat: z.number().nonnegative(),
    seatsTotal: z.number().int().positive(),
    seatsAvailable: z.number().int().nonnegative(),
    amenities: z.array(TrajetAmenitySchema),
    paymentMethods: RidePaymentMethodsSchema,
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
    // Set when the driver picked a precise point via the location picker
    // (apps/web's LocationPicker); left null for a free-text-only entry.
    departureLat: z.number().min(-90).max(90).nullable().optional(),
    departureLng: z.number().min(-180).max(180).nullable().optional(),
    arrivalLat: z.number().min(-90).max(90).nullable().optional(),
    arrivalLng: z.number().min(-180).max(180).nullable().optional(),
    departureAt: z.iso.datetime(),
    /** Optional — not every driver knows or wants to commit to an arrival time. */
    arrivalAt: z.iso.datetime().nullable().optional(),
    pricePerSeat: z.number().nonnegative(),
    seatsTotal: z.number().int().min(1).max(8),
    amenities: z.array(TrajetAmenitySchema).default([]),
    paymentMethods: RidePaymentMethodsSchema,
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
    paymentMethod: RidePaymentMethodSchema,
  })
  .describe('CreateBookingRequest');

export type CreateBookingRequest = z.infer<typeof CreateBookingRequestSchema>;
