import { z } from 'zod';
import { paginatedSchema } from './trajet';

/**
 * Which side of a completed booking wrote the review — a passenger rating
 * the driver, or the driver rating a passenger. `POST /reviews` derives this
 * from the caller's identity rather than trusting the client for it.
 */
export const ReviewDirectionSchema = z.enum(['passenger_to_driver', 'driver_to_passenger']);
export type ReviewDirection = z.infer<typeof ReviewDirectionSchema>;

/**
 * Review contract — the single source of truth for this entity.
 * Either party of a completed, confirmed booking may rate the other: their
 * booking must be `confirmed` and the trip's `departureDateTime` must already
 * be in the past (see apps/api/src/modules/review/index.ts for the
 * enforcement). At most one review per booking per direction.
 */
export const ReviewSchema = z
  .object({
    id: z.string().uuid(),
    trajetId: z.string(),
    bookingId: z.string(),
    driverId: z.string(),
    passengerId: z.string(),
    direction: ReviewDirectionSchema,
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(1000).optional().nullable(),
    createdAt: z.string().describe('ISO-8601 timestamp'),
    updatedAt: z.string().describe('ISO-8601 timestamp'),
  })
  .describe('Review');
export type Review = z.infer<typeof ReviewSchema>;

/**
 * Payload for `POST /reviews`. Only `bookingId` identifies what's being
 * reviewed — the server derives `trajetId`/`driverId`/`passengerId`/`direction`
 * from that booking and the caller's identity rather than trusting the client
 * for them.
 */
export const CreateReviewSchema = z
  .object({
    bookingId: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(1000).optional().nullable(),
  })
  .describe('CreateReview');
export type CreateReview = z.infer<typeof CreateReviewSchema>;

export const ReviewPageSchema = paginatedSchema(ReviewSchema).describe('ReviewPage');

/** `GET /drivers/:driverId/rating` or `GET /passengers/:passengerId/rating` — null average when there are no reviews yet. */
export const RatingSummarySchema = z
  .object({
    averageRating: z.number().min(1).max(5).nullable(),
    reviewCount: z.number().int().min(0),
  })
  .describe('RatingSummary');
export type RatingSummary = z.infer<typeof RatingSummarySchema>;
