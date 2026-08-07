import { z } from 'zod';

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
    seatsTotal: z.number().int().min(1),
    seatsAvailable: z.number().int().min(0),
    pricePerSeat: z.number().nonnegative(),
    description: z.string().max(1000).optional().nullable(),
    comfort: z.enum(['standard', 'confort', 'premium']).optional().nullable(),
    baggageAllowance: z.string().max(500).optional().nullable(),
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
    departureDateTime: z.string().datetime(),
    seatsTotal: z.number().int().min(1),
    pricePerSeat: z.number().nonnegative(),
    description: z.string().max(1000).optional().nullable(),
    comfort: z.enum(['standard', 'confort', 'premium']).optional().nullable(),
    baggageAllowance: z.string().max(500).optional().nullable(),
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
    departureDateTime: z.string().datetime().optional(),
    seatsTotal: z.number().int().min(1).optional(),
    pricePerSeat: z.number().nonnegative().optional(),
    description: z.string().max(1000).optional().nullable(),
    comfort: z.enum(['standard', 'confort', 'premium']).optional().nullable(),
    baggageAllowance: z.string().max(500).optional().nullable(),
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
 * A trajet as returned by search, with the driver's rating summary and (when
 * `nearLat`/`nearLng` were part of the query) the departure point's distance
 * from that reference point attached, so the results list doesn't need a
 * second fetch per row. `driverRating`/`distanceKm` are null when there's no
 * driver review yet / no `nearLat`+`nearLng` in the query, respectively.
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
 * substring matches; `date` matches trajets departing on that calendar day;
 * `minDriverRating` keeps only trajets whose driver's average rating (across
 * their `passenger_to_driver` reviews) is at least that value — drivers with
 * no reviews yet never match a `minDriverRating` filter.
 * `nearLat`/`nearLng` (a passenger's own location, e.g. from the browser's
 * geolocation API) must be provided together; results are then sorted by
 * distance from that point to the trajet's departure point, and trajets
 * whose departure was never successfully geocoded never match. `radiusKm`
 * additionally excludes anything farther than that — it's ignored if
 * `nearLat`/`nearLng` are absent.
 */
export const TrajetSearchQuerySchema = z
  .object({
    departureCity: z.string().min(1).optional(),
    destinationCity: z.string().min(1).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('YYYY-MM-DD'),
    minSeats: z.coerce.number().int().min(1).optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    comfort: z.enum(['standard', 'confort', 'premium']).optional(),
    baggageAllowance: z.string().min(1).optional(),
    minDriverRating: z.coerce.number().min(1).max(5).optional(),
    nearLat: z.coerce.number().min(-90).max(90).optional(),
    nearLng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().positive().max(20000).optional(),
  })
  .extend(PaginationQuerySchema.shape)
  .refine((data) => (data.nearLat === undefined) === (data.nearLng === undefined), {
    message: 'nearLat and nearLng must be provided together',
    path: ['nearLat'],
  })
  .describe('TrajetSearchQuery');
export type TrajetSearchQuery = z.infer<typeof TrajetSearchQuerySchema>;

/**
 * Booking contract — a passenger reserving seats on a trajet.
 * A booking starts `pending` (seats are provisionally held) and either:
 * - the driver moves it to `confirmed` or `rejected` via UpdateBookingStatusSchema,
 * - the passenger moves it to `cancelled` (POST .../cancel), or
 * - the system moves it to `expired` once it has sat `pending` past the TTL
 *   (see PENDING_BOOKING_TTL_MS in the trajet module) without a driver response.
 */
export const CreateBookingSchema = z
  .object({
    seats: z.number().int().min(1),
  })
  .describe('CreateBooking');
export type CreateBooking = z.infer<typeof CreateBookingSchema>;

export const BookingStatusSchema = z.enum(['pending', 'confirmed', 'rejected', 'cancelled', 'expired']);
export type BookingStatus = z.infer<typeof BookingStatusSchema>;

export const BookingSchema = z
  .object({
    id: z.string(),
    trajetId: z.string(),
    passengerId: z.string(),
    seats: z.number().int().min(1),
    status: BookingStatusSchema,
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
  })
  .describe('BookingTrajetSummary');

export const BookingWithTrajetSchema = BookingSchema.extend({
  trajet: BookingTrajetSummarySchema,
}).describe('BookingWithTrajet');
export type BookingWithTrajet = z.infer<typeof BookingWithTrajetSchema>;

export const BookingWithTrajetPageSchema = paginatedSchema(BookingWithTrajetSchema).describe(
  'BookingWithTrajetPage',
);

/**
 * Driver-only action: accept or reject a pending booking request.
 */
export const UpdateBookingStatusSchema = z
  .object({
    status: z.enum(['confirmed', 'rejected']),
  })
  .describe('UpdateBookingStatus');
export type UpdateBookingStatus = z.infer<typeof UpdateBookingStatusSchema>;
