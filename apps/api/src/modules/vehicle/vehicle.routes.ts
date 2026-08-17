import { createRoute, z } from '@hono/zod-openapi';
import { VehicleSchema, UpsertVehicleSchema } from '@carpool/schemas';

const bearerAuth = [{ Bearer: [] }];
const errorSchema = z.object({ error: z.string() });

/**
 * The signed-in driver's own vehicle. Served separately from `/documents`
 * because it is a description (make/model/colour/seats/plate), not a file —
 * proof of registration is still an `immatriculation` document upload.
 */
export const getMyVehicleRoute = createRoute({
  method: 'get',
  path: '/vehicles/me',
  tags: ['vehicle'],
  summary: "Get the signed-in driver's vehicle",
  security: bearerAuth,
  responses: {
    200: {
      description: 'The declared vehicle',
      content: { 'application/json': { schema: VehicleSchema } },
    },
    404: {
      description: 'No vehicle declared yet',
      content: { 'application/json': { schema: errorSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

/**
 * Declare or correct the vehicle. One row per driver: a corrected
 * make/model/colour/plate replaces the old row instead of stacking up.
 */
export const putMyVehicleRoute = createRoute({
  method: 'put',
  path: '/vehicles/me',
  tags: ['vehicle'],
  summary: "Declare or update the signed-in driver's vehicle",
  security: bearerAuth,
  request: {
    body: { content: { 'application/json': { schema: UpsertVehicleSchema } } },
  },
  responses: {
    200: {
      description: 'Vehicle saved',
      content: { 'application/json': { schema: VehicleSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});
