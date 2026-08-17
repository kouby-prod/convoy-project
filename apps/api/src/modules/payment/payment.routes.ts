import { createRoute, z } from '@hono/zod-openapi';
import {
  BookingPaymentStateSchema,
  CapturePayPalSchema,
  CheckoutResponseSchema,
  CreatePaymentSchema,
  InvoiceSchema,
} from '@carpool/schemas';

const bearerAuth = [{ Bearer: [] }];
const errorSchema = z.object({ error: z.string() });

export const createPaymentRoute = createRoute({
  method: 'post',
  path: '/payments',
  tags: ['payment'],
  summary: 'Start a Stripe or PayPal checkout for an issued invoice',
  security: bearerAuth,
  request: {
    headers: z.object({
      'Idempotency-Key': z.string().min(1).optional(),
    }),
    body: { content: { 'application/json': { schema: CreatePaymentSchema } } },
  },
  responses: {
    200: {
      description: 'Checkout credentials',
      content: { 'application/json': { schema: CheckoutResponseSchema } },
    },
    400: {
      description: 'Booking is not awaiting payment',
      content: { 'application/json': { schema: errorSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Not the passenger',
      content: { 'application/json': { schema: errorSchema } },
    },
    409: {
      description: 'Idempotency-Key reused with a different body',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: {
      description: 'Booking not found',
      content: { 'application/json': { schema: errorSchema } },
    },
    503: {
      description: 'Payment provider is not configured',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const capturePayPalRoute = createRoute({
  method: 'post',
  path: '/payments/paypal/capture',
  tags: ['payment'],
  summary: 'Capture a PayPal order after the buyer approves it',
  security: bearerAuth,
  request: {
    body: { content: { 'application/json': { schema: CapturePayPalSchema } } },
  },
  responses: {
    200: {
      description: 'Capture result',
      content: { 'application/json': { schema: BookingPaymentStateSchema } },
    },
    400: {
      description: 'Order cannot be captured',
      content: { 'application/json': { schema: errorSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Not the passenger',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: {
      description: 'Invoice or booking not found',
      content: { 'application/json': { schema: errorSchema } },
    },
    503: {
      description: 'PayPal is not configured',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const getPaymentByBookingRoute = createRoute({
  method: 'get',
  path: '/payments/by-booking/{bookingId}',
  tags: ['payment'],
  summary: 'Invoice and latest payment for a booking',
  security: bearerAuth,
  request: { params: z.object({ bookingId: z.string() }) },
  responses: {
    200: {
      description: 'Payment state',
      content: { 'application/json': { schema: BookingPaymentStateSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Not allowed',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: {
      description: 'Booking not found',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const getInvoiceByBookingRoute = createRoute({
  method: 'get',
  path: '/invoices/by-booking/{bookingId}',
  tags: ['payment'],
  summary: 'Invoice issued for a booking',
  security: bearerAuth,
  request: { params: z.object({ bookingId: z.string() }) },
  responses: {
    200: {
      description: 'Invoice',
      content: { 'application/json': { schema: InvoiceSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Not allowed',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: {
      description: 'Invoice not found',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const getInvoiceRoute = createRoute({
  method: 'get',
  path: '/invoices/{id}',
  tags: ['payment'],
  summary: 'Get an invoice by id',
  security: bearerAuth,
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      description: 'Invoice',
      content: { 'application/json': { schema: InvoiceSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Not allowed',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});
