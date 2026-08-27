import { z } from 'zod';

/**
 * Live location contract — the single source of truth for this entity.
 * A location is scoped to a trajet (not a booking): the driver publishes one
 * position stream that every confirmed passenger of that ride can watch.
 * There is no history table — only the latest position is kept (see
 * apps/api/src/modules/tracking/store.ts), since a live map has no use for
 * where the driver was five minutes ago.
 */
export const LiveLocationSchema = z
  .object({
    trajetId: z.string(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    heading: z.number().min(0).max(360).nullable(),
    speed: z.number().min(0).nullable(),
    updatedAt: z.string().describe('ISO-8601 timestamp'),
  })
  .describe('LiveLocation');
export type LiveLocation = z.infer<typeof LiveLocationSchema>;

/**
 * Payload for `POST /trajets/:id/location`. `trajetId` comes from the route
 * param (driver-only, checked server-side), not the body. `heading`/`speed`
 * mirror whatever the browser's Geolocation API reports — both are commonly
 * null (e.g. a GPS fix with no motion, or an unsupported device), so callers
 * must not assume they are present.
 */
export const UpdateLiveLocationSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    heading: z.number().min(0).max(360).nullable().optional(),
    speed: z.number().min(0).nullable().optional(),
  })
  .describe('UpdateLiveLocation');
export type UpdateLiveLocation = z.infer<typeof UpdateLiveLocationSchema>;

export const LiveLocationResponseSchema = z
  .object({
    /** `null` means the driver isn't currently sharing (never started, stopped, or the position expired). */
    location: LiveLocationSchema.nullable(),
  })
  .describe('LiveLocationResponse');
export type LiveLocationResponse = z.infer<typeof LiveLocationResponseSchema>;

/**
 * Client → server frames on `GET /ws/location`. Same subscribe/unsubscribe
 * shape as `GET /ws/messages` (see `WsClientFrameSchema` in ./message),
 * scoped to a trajet instead of a booking.
 */
export const WsLocationClientFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe'), trajetId: z.string().uuid() }),
  z.object({ type: z.literal('unsubscribe'), trajetId: z.string().uuid() }),
  z.object({ type: z.literal('ping') }),
]);
export type WsLocationClientFrame = z.infer<typeof WsLocationClientFrameSchema>;

/** Server → client frames on `GET /ws/location`. */
export const WsLocationServerFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribed'), trajetId: z.string() }),
  z.object({ type: z.literal('unsubscribed'), trajetId: z.string() }),
  z.object({ type: z.literal('location.updated'), trajetId: z.string(), location: LiveLocationSchema }),
  z.object({ type: z.literal('location.stopped'), trajetId: z.string() }),
  z.object({ type: z.literal('pong') }),
  z.object({ type: z.literal('error'), error: z.string(), trajetId: z.string().optional() }),
]);
export type WsLocationServerFrame = z.infer<typeof WsLocationServerFrameSchema>;
