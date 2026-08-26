import { createRoute, z } from '@hono/zod-openapi';
import {
  AdminDocumentListSchema,
  AdminDocumentQuerySchema,
  AdminDocumentSchema,
  AdminBookingListSchema,
  AdminBookingQuerySchema,
  AdminInvoiceListSchema,
  AdminInvoiceQuerySchema,
  AdminMismatchQuerySchema,
  AdminPayoutQuerySchema,
  AdminStatsSchema,
  AdminTrajetListSchema,
  AdminTrajetQuerySchema,
  AdminUserListSchema,
  AdminUserQuerySchema,
  DriverPayoutSchema,
  MarkDriverPayoutPaidSchema,
  ReconciliationMismatchSchema,
  ResolveMismatchSchema,
  ReviewDocumentSchema,
} from '@carpool/schemas';

// Bearer scheme for the authed routes (cookie sessions work too). Mirrors
// apps/api/src/routes/auth-proofs.ts.
const bearerAuth = [{ Bearer: [] }];
const errorSchema = z.object({ error: z.string() });

/**
 * Every route below is admin-only. They all declare 401 AND 403 because those
 * are different answers: "sign in" versus "you are signed in, and this is not
 * for you".
 */

export const getAdminStatsRoute = createRoute({
  method: 'get',
  path: '/admin/stats',
  tags: ['admin'],
  summary: 'Backoffice dashboard counters',
  security: bearerAuth,
  responses: {
    200: {
      description: 'Document and account totals',
      content: { 'application/json': { schema: AdminStatsSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Authenticated but not an admin',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const listAdminDocumentsRoute = createRoute({
  method: 'get',
  path: '/admin/documents',
  tags: ['admin'],
  summary: 'The document submission queue',
  description:
    'Every submission with its submitter attached. Filters narrow the queue; a ' +
    'bare call returns everything, newest first.',
  security: bearerAuth,
  request: { query: AdminDocumentQuerySchema },
  responses: {
    200: {
      description: 'Matching submissions',
      content: { 'application/json': { schema: AdminDocumentListSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Authenticated but not an admin',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

/**
 * Approve or reject one submission. A rejection must carry a note — that rule
 * lives in `ReviewDocumentSchema`, so an empty rejection fails validation with a
 * 400 instead of being something every caller has to remember.
 */
export const reviewDocumentRoute = createRoute({
  method: 'patch',
  path: '/admin/documents/{id}',
  tags: ['admin'],
  summary: 'Approve or reject a submitted document',
  security: bearerAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: ReviewDocumentSchema } } },
  },
  responses: {
    200: {
      description: 'The reviewed submission',
      content: { 'application/json': { schema: AdminDocumentSchema } },
    },
    400: {
      description: 'Approving a licence without confirming the date of birth on it',
      content: { 'application/json': { schema: errorSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Authenticated but not an admin',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const listAdminUsersRoute = createRoute({
  method: 'get',
  path: '/admin/users',
  tags: ['admin'],
  summary: "Accounts, with each one's document tally",
  security: bearerAuth,
  request: { query: AdminUserQuerySchema },
  responses: {
    200: {
      description: 'All accounts, newest first',
      content: { 'application/json': { schema: AdminUserListSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Authenticated but not an admin',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const listAdminTrajetsRoute = createRoute({
  method: 'get',
  path: '/admin/trajets',
  tags: ['admin'],
  summary: 'Published ride ads, filterable by date and state',
  security: bearerAuth,
  request: { query: AdminTrajetQuerySchema },
  responses: {
    200: {
      description: 'Matching ads, by ride date',
      content: { 'application/json': { schema: AdminTrajetListSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Authenticated but not an admin',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const listAdminBookingsRoute = createRoute({
  method: 'get',
  path: '/admin/bookings',
  tags: ['admin'],
  summary: 'Reservations with trip, people, and invoice status',
  security: bearerAuth,
  request: { query: AdminBookingQuerySchema },
  responses: {
    200: {
      description: 'Matching reservations, by ride date',
      content: { 'application/json': { schema: AdminBookingListSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Authenticated but not an admin',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const listAdminInvoicesRoute = createRoute({
  method: 'get',
  path: '/admin/invoices',
  tags: ['admin'],
  summary: 'Passenger invoices and latest payment attempt',
  security: bearerAuth,
  request: { query: AdminInvoiceQuerySchema },
  responses: {
    200: {
      description: 'Matching invoices, newest first',
      content: { 'application/json': { schema: AdminInvoiceListSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Authenticated but not an admin',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const listAdminPayoutsRoute = createRoute({
  method: 'get',
  path: '/admin/payouts',
  tags: ['admin'],
  summary: 'Driver payout queue (manual, no Connect)',
  security: bearerAuth,
  request: { query: AdminPayoutQuerySchema },
  responses: {
    200: {
      description: 'Matching payouts, newest first',
      content: { 'application/json': { schema: z.array(DriverPayoutSchema) } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Authenticated but not an admin',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const markAdminPayoutPaidRoute = createRoute({
  method: 'post',
  path: '/admin/payouts/{id}/paid',
  tags: ['admin'],
  summary: 'Mark a driver payout as paid',
  security: bearerAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: MarkDriverPayoutPaidSchema } } },
  },
  responses: {
    200: {
      description: 'The paid payout',
      content: { 'application/json': { schema: DriverPayoutSchema } },
    },
    400: {
      description: 'Payout is not held or due',
      content: { 'application/json': { schema: errorSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Authenticated but not an admin',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const listAdminMismatchesRoute = createRoute({
  method: 'get',
  path: '/admin/payments/incidents',
  tags: ['admin'],
  summary: 'Open payment incidents and reconcile mismatches',
  security: bearerAuth,
  request: { query: AdminMismatchQuerySchema },
  responses: {
    200: {
      description: 'Incidents, newest first',
      content: { 'application/json': { schema: z.array(ReconciliationMismatchSchema) } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Authenticated but not an admin',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

export const resolveAdminMismatchRoute = createRoute({
  method: 'post',
  path: '/admin/payments/incidents/{id}/resolve',
  tags: ['admin'],
  summary: 'Mark a payment incident as resolved',
  security: bearerAuth,
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: ResolveMismatchSchema } } },
  },
  responses: {
    200: {
      description: 'The resolved incident',
      content: { 'application/json': { schema: ReconciliationMismatchSchema } },
    },
    400: {
      description: 'Incident is already resolved',
      content: { 'application/json': { schema: errorSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
    403: {
      description: 'Authenticated but not an admin',
      content: { 'application/json': { schema: errorSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});
