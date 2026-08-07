import { createRoute, z } from '@hono/zod-openapi';
import {
  ReviewSchema,
  ReviewPageSchema,
  CreateReviewSchema,
  RatingSummarySchema,
  PaginationQuerySchema,
} from '@carpool/schemas';

// Bearer scheme for the authed routes (cookie sessions work too). Mirrors
// apps/api/src/routes/auth-proofs.ts.
const bearerAuth = [{ Bearer: [] }];
const errorSchema = z.object({ error: z.string() });

export const createReviewRoute = createRoute({
  method: 'post',
  path: '/reviews',
  tags: ['review'],
  summary:
    'Rate the other party of a completed, confirmed booking — the passenger rates the driver, or the ' +
    'driver rates the passenger, depending on who calls it. One review per booking per direction.',
  security: bearerAuth,
  request: {
    body: { content: { 'application/json': { schema: CreateReviewSchema } } },
  },
  responses: {
    201: {
      description: 'Review created',
      content: { 'application/json': { schema: ReviewSchema } },
    },
    400: {
      description: 'Booking is not confirmed, the trip has not departed yet, or it was already reviewed',
      content: { 'application/json': { schema: errorSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Neither the passenger nor the driver of this booking',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: {
      description: 'Booking not found',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const listDriverReviewsRoute = createRoute({
  method: 'get',
  path: '/drivers/{driverId}/reviews',
  tags: ['review'],
  summary: "List a driver's reviews",
  request: {
    params: z.object({ driverId: z.string().min(1) }),
    query: PaginationQuerySchema,
  },
  responses: {
    200: {
      description: 'A page of reviews',
      content: { 'application/json': { schema: ReviewPageSchema } },
    },
  },
});

export const getDriverRatingRoute = createRoute({
  method: 'get',
  path: '/drivers/{driverId}/rating',
  tags: ['review'],
  summary: "A driver's average rating and review count (from passenger_to_driver reviews only)",
  request: {
    params: z.object({ driverId: z.string().min(1) }),
  },
  responses: {
    200: {
      description: 'Rating summary',
      content: { 'application/json': { schema: RatingSummarySchema } },
    },
  },
});

export const listPassengerReviewsRoute = createRoute({
  method: 'get',
  path: '/passengers/{passengerId}/reviews',
  tags: ['review'],
  summary: "List the reviews drivers left for a passenger",
  request: {
    params: z.object({ passengerId: z.string().min(1) }),
    query: PaginationQuerySchema,
  },
  responses: {
    200: {
      description: 'A page of reviews',
      content: { 'application/json': { schema: ReviewPageSchema } },
    },
  },
});

export const getPassengerRatingRoute = createRoute({
  method: 'get',
  path: '/passengers/{passengerId}/rating',
  tags: ['review'],
  summary: "A passenger's average rating and review count (from driver_to_passenger reviews only)",
  request: {
    params: z.object({ passengerId: z.string().min(1) }),
  },
  responses: {
    200: {
      description: 'Rating summary',
      content: { 'application/json': { schema: RatingSummarySchema } },
    },
  },
});
