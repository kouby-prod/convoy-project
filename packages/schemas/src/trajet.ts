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
 * Search/filter query for `GET /trajets`. Every field is optional and
 * additive (AND-combined) — an absent field applies no filter.
 * `departureCity`/`destinationCity`/`baggageAllowance` are case-insensitive
 * substring matches; `date` matches trajets departing on that calendar day.
 * There is no `driverRating` filter — no rating/review system exists yet.
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
  })
  .describe('TrajetSearchQuery');
export type TrajetSearchQuery = z.infer<typeof TrajetSearchQuerySchema>;

/**
 * Booking contract — a passenger reserving seats on a trajet.
 * A booking starts `pending` (seats are provisionally held) and the driver
 * moves it to `confirmed` or `rejected` via UpdateBookingStatusSchema.
 * `cancelled` is reserved for a future passenger-initiated cancellation.
 */
export const CreateBookingSchema = z
  .object({
    seats: z.number().int().min(1),
  })
  .describe('CreateBooking');
export type CreateBooking = z.infer<typeof CreateBookingSchema>;

export const BookingStatusSchema = z.enum(['pending', 'confirmed', 'rejected', 'cancelled']);
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

export const BookingListSchema = z.array(BookingSchema).describe('BookingList');

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

export const BookingWithTrajetListSchema = z
  .array(BookingWithTrajetSchema)
  .describe('BookingWithTrajetList');

/**
 * Driver-only action: accept or reject a pending booking request.
 */
export const UpdateBookingStatusSchema = z
  .object({
    status: z.enum(['confirmed', 'rejected']),
  })
  .describe('UpdateBookingStatus');
export type UpdateBookingStatus = z.infer<typeof UpdateBookingStatusSchema>;
