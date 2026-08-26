import { z } from 'zod';

export const NotificationTypeSchema = z.enum([
  'booking_request',
  'booking_status',
  'trip_cancelled',
  'message',
  'system',
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  title: z.string(),
  body: z.string(),
  channel: z.string(),
  type: NotificationTypeSchema,
  link: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const NotificationPageSchema = z.object({
  items: NotificationSchema.array(),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  hasMore: z.boolean(),
  unreadCount: z.number().int().min(0),
});

export const UnreadCountSchema = z.object({
  unreadCount: z.number().int().min(0),
});

export const MarkAllReadResponseSchema = z.object({
  updated: z.number().int().min(0),
});

/** Missing row means both channels on — same as a fresh account. */
export const NotificationPreferenceSchema = z.object({
  emailEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
});
export const UpdateNotificationPreferenceSchema = NotificationPreferenceSchema;
export type NotificationPreference = z.infer<typeof NotificationPreferenceSchema>;

export const DEFAULT_NOTIFICATION_PREFERENCE: NotificationPreference = {
  emailEnabled: true,
  inAppEnabled: true,
};

export type Notification = z.infer<typeof NotificationSchema>;
export type NotificationPage = z.infer<typeof NotificationPageSchema>;

/**
 * Client → server frames on `GET /ws/notifications`. No subscribe step: a
 * user's socket receives all of their own notifications once authenticated.
 */
export const WsNotificationClientFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ping') }),
]);
export type WsNotificationClientFrame = z.infer<typeof WsNotificationClientFrameSchema>;

/**
 * Server → client frames on `GET /ws/notifications`. `ready` is sent right
 * after a successful auth handshake, since there's no subscribe ack to wait
 * for otherwise.
 */
export const WsNotificationServerFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('notification.created'), notification: NotificationSchema }),
  z.object({ type: z.literal('pong') }),
  z.object({ type: z.literal('error'), error: z.string() }),
]);
export type WsNotificationServerFrame = z.infer<typeof WsNotificationServerFrameSchema>;
