import { createRoute, z } from '@hono/zod-openapi';
import {
  TrajetSchema,
  TrajetPageSchema,
  TrajetSearchPageSchema,
  TrajetApiSearchQuerySchema,
  PaginationQuerySchema,
  CreateTrajetSchema,
  UpdateTrajetSchema,
  BookingSchema,
  BookingWithTrajetPageSchema,
  DriverBookingPageSchema,
  CreateBookingSchema,
  UpdateBookingStatusSchema,
} from '@carpool/schemas';

// Bearer scheme for the authed routes (cookie sessions work too). Mirrors
// apps/api/src/routes/auth-proofs.ts.
const bearerAuth = [{ Bearer: [] }];
const errorSchema = z.object({ error: z.string() });

// Enforced by the rate-limit middleware in apps/api/src/modules/trajet/index.ts
// (not the route handler), but documented here like any other response.
const rateLimitedResponse = {
  description: 'Too many requests — see the Retry-After header',
  content: { 'application/json': { schema: errorSchema } },
};

export const listTrajetsRoute = createRoute({
  method: 'get',
  path: '/trajets',
  tags: ['trajet'],
  summary:
    'List trajets, optionally filtered by city, date, seats, price, comfort, baggage or minimum driver ' +
    'rating. Each result includes the driver\'s rating summary.',
  request: { query: TrajetApiSearchQuerySchema },
  responses: {
    200: {
      description: 'A page of trajets, each with the driver rating attached',
      content: { 'application/json': { schema: TrajetSearchPageSchema } },
    },
    429: rateLimitedResponse,
  },
});

export const getTrajetRoute = createRoute({
  method: 'get',
  path: '/trajets/{id}',
  tags: ['trajet'],
  summary: 'Get a single trajet by id',
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: 'The trajet',
      content: { 'application/json': { schema: TrajetSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const createTrajetRoute = createRoute({
  method: 'post',
  path: '/trajets',
  tags: ['trajet'],
  summary: 'Create a trajet',
  security: bearerAuth,
  request: {
    body: { content: { 'application/json': { schema: CreateTrajetSchema } } },
  },
  responses: {
    201: {
      description: 'Created',
      content: { 'application/json': { schema: TrajetSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const updateTrajetRoute = createRoute({
  method: 'patch',
  path: '/trajets/{id}',
  tags: ['trajet'],
  summary: 'Update a published trajet (driver only)',
  security: bearerAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: UpdateTrajetSchema } } },
  },
  responses: {
    200: {
      description: 'Updated',
      content: { 'application/json': { schema: TrajetSchema } },
    },
    400: {
      description: 'seatsTotal is below the number of seats already booked, or the trajet is cancelled',
      content: { 'application/json': { schema: errorSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Not the driver of this trajet',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: {
      description: 'Trajet not found',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const cancelTrajetRoute = createRoute({
  method: 'delete',
  path: '/trajets/{id}',
  tags: ['trajet'],
  summary: 'Cancel a published trajet (driver only) — soft delete, cascades to active bookings',
  security: bearerAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Cancelled',
      content: { 'application/json': { schema: TrajetSchema } },
    },
    400: {
      description: 'Trajet is already cancelled',
      content: { 'application/json': { schema: errorSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Not the driver of this trajet',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: {
      description: 'Trajet not found',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const bookTrajetRoute = createRoute({
  method: 'post',
  path: '/trajets/{id}/book',
  tags: ['trajet'],
  summary: 'Book seats on a trajet',
  security: bearerAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: CreateBookingSchema } } },
  },
  responses: {
    201: {
      description: 'Booking created',
      content: { 'application/json': { schema: BookingSchema } },
    },
    400: {
      description: 'Not enough seats available',
      content: { 'application/json': { schema: errorSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Cannot book your own trajet',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: {
      description: 'Trajet not found',
      content: { 'application/json': { schema: errorSchema } },
    },
    429: rateLimitedResponse,
  },
});

export const listTrajetBookingsRoute = createRoute({
  method: 'get',
  path: '/trajets/{id}/bookings',
  tags: ['trajet'],
  summary: 'List bookings for a trajet (driver only)',
  security: bearerAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
    query: PaginationQuerySchema,
  },
  responses: {
    200: {
      description: 'A page of bookings',
      content: { 'application/json': { schema: DriverBookingPageSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Not the driver of this trajet',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: {
      description: 'Trajet not found',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const updateBookingStatusRoute = createRoute({
  method: 'patch',
  path: '/trajets/{id}/bookings/{bookingId}',
  tags: ['trajet'],
  summary: "Accept or reject a passenger's booking request (driver only)",
  security: bearerAuth,
  request: {
    params: z.object({ id: z.string().uuid(), bookingId: z.string().uuid() }),
    body: { content: { 'application/json': { schema: UpdateBookingStatusSchema } } },
  },
  responses: {
    200: {
      description: 'Booking updated',
      content: { 'application/json': { schema: BookingSchema } },
    },
    400: {
      description: 'Booking is not pending',
      content: { 'application/json': { schema: errorSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Not the driver of this trajet',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: {
      description: 'Trajet or booking not found',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const cancelBookingRoute = createRoute({
  method: 'post',
  path: '/trajets/{id}/bookings/{bookingId}/cancel',
  tags: ['trajet'],
  summary: 'Cancel your own booking request (passenger only)',
  security: bearerAuth,
  request: {
    params: z.object({ id: z.string().uuid(), bookingId: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Booking cancelled',
      content: { 'application/json': { schema: BookingSchema } },
    },
    400: {
      description: 'Booking cannot be cancelled',
      content: { 'application/json': { schema: errorSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Not your booking',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: {
      description: 'Trajet or booking not found',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const myTrajetsRoute = createRoute({
  method: 'get',
  path: '/me/trajets',
  tags: ['trajet'],
  summary: "List the current user's published trajets (driver history), paginated",
  security: bearerAuth,
  request: { query: PaginationQuerySchema },
  responses: {
    200: {
      description: 'A page of trajets',
      content: { 'application/json': { schema: TrajetPageSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const myBookingsRoute = createRoute({
  method: 'get',
  path: '/me/bookings',
  tags: ['trajet'],
  summary: "List the current user's bookings, each with a trajet summary",
  security: bearerAuth,
  request: { query: PaginationQuerySchema },
  responses: {
    200: {
      description: 'A page of bookings',
      content: { 'application/json': { schema: BookingWithTrajetPageSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});
