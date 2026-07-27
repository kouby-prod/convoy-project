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
