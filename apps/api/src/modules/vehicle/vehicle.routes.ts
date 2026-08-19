import { createRoute, z } from '@hono/zod-openapi';
import {
  VehicleSchema,
  UpsertVehicleSchema,
  VehiclePhotoUploadUrlRequestSchema,
  VehiclePhotoUploadUrlSchema,
  ConfirmVehiclePhotoSchema,
  VehiclePhotoUrlSchema,
} from '@carpool/schemas';

const bearerAuth = [{ Bearer: [] }];
const errorSchema = z.object({ error: z.string() });

/**
 * The signed-in driver's own vehicle. Served separately from `/documents`
 * because it is a self-declared description (make/model/colour/seats/plate)
 * plus a self-certified insurance flag — never a reviewed file upload.
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

/**
 * Step 1 of the optional photo upload handshake — mirrors
 * `POST /documents/upload-url`, but scoped to the vehicle photo rather than a
 * reviewed identity document.
 */
export const createVehiclePhotoUploadUrlRoute = createRoute({
  method: 'post',
  path: '/vehicles/me/photo-upload-url',
  tags: ['vehicle'],
  summary: 'Get a presigned URL to upload the vehicle photo',
  security: bearerAuth,
  request: {
    body: { content: { 'application/json': { schema: VehiclePhotoUploadUrlRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Presigned upload URL',
      content: { 'application/json': { schema: VehiclePhotoUploadUrlSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

/**
 * Step 3 — verifies the object landed, then records it on the vehicle row.
 * Requires the vehicle to already exist (Étape 3's own fields must be saved
 * first): the photo is optional, but it still needs somewhere to attach to.
 */
export const putMyVehiclePhotoRoute = createRoute({
  method: 'put',
  path: '/vehicles/me/photo',
  tags: ['vehicle'],
  summary: "Attach an uploaded photo to the signed-in driver's vehicle",
  security: bearerAuth,
  request: {
    body: { content: { 'application/json': { schema: ConfirmVehiclePhotoSchema } } },
  },
  responses: {
    200: {
      description: 'Photo attached',
      content: { 'application/json': { schema: VehicleSchema } },
    },
    400: {
      description: 'The upload is unknown, never completed, or no vehicle exists yet',
      content: { 'application/json': { schema: errorSchema } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

/**
 * A fresh signed URL for a vehicle's photo. Public (unlike a driver
 * document): a rider viewing a public ride listing is exactly who this is
 * for, so — unlike `getDocumentFileRoute` — this route requires no session
 * and declares only 200/404 (no 401 to speak of).
 *
 * Its own top-level path rather than `/vehicles/{ownerId}/photo`, so a
 * dynamic `{ownerId}` never sits at the same depth as the static `me` used by
 * every other route here (`/vehicles/me`, `/vehicles/me/photo`, …) — kept
 * separate on principle, the way `/me/trajets` stays apart from `/trajets/{id}`
 * (see trajet.routes.ts), even though this one didn't reproduce a client
 * inference break in practice.
 */
export const getVehiclePhotoRoute = createRoute({
  method: 'get',
  path: '/vehicle-photos/{ownerId}',
  tags: ['vehicle'],
  summary: "Get a short-lived URL to view a driver's vehicle photo",
  request: { params: z.object({ ownerId: z.string().min(1) }) },
  responses: {
    200: {
      description: 'Signed view URL',
      content: { 'application/json': { schema: VehiclePhotoUrlSchema } },
    },
    404: {
      description: 'No vehicle, or no photo on it',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});
