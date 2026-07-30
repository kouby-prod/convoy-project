import { createRoute, z } from '@hono/zod-openapi';
import {
  TrajetSchema,
  TrajetListSchema,
  TrajetPageSchema,
  TrajetSearchQuerySchema,
  PaginationQuerySchema,
  CreateTrajetSchema,
  BookingSchema,
  BookingPageSchema,
  BookingWithTrajetPageSchema,
  CreateBookingSchema,
  UpdateBookingStatusSchema,
} from '@carpool/schemas';

// Bearer scheme for the authed routes (cookie sessions work too). Mirrors
// apps/api/src/routes/auth-proofs.ts.
const bearerAuth = [{ Bearer: [] }];
const errorSchema = z.object({ error: z.string() });

export const listTrajetsRoute = createRoute({
  method: 'get',
  path: '/trajets',
  tags: ['trajet'],
  summary: 'List trajets, optionally filtered by city, date, seats, price, comfort or baggage',
  request: { query: TrajetSearchQuerySchema },
  responses: {
    200: {
      description: 'A page of trajets',
      content: { 'application/json': { schema: TrajetPageSchema } },
    },
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
      content: { 'application/json': { schema: BookingPageSchema } },
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
  summary: "List the current user's published trajets (driver history)",
  security: bearerAuth,
  responses: {
    200: {
      description: 'List of trajets',
      content: { 'application/json': { schema: TrajetListSchema } },
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
