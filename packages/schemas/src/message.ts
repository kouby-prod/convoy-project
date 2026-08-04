import { z } from 'zod';
import { paginatedSchema } from './trajet';

/**
 * Message contract — the single source of truth for this entity.
 * A message belongs to a booking; there is no separate "conversation" table
 * because a booking already identifies the two parties (its passengerId and
 * the trajet's driverId). Either party may post to a booking's thread
 * regardless of the booking's status — messaging a driver/passenger you no
 * longer have an active booking with (e.g. after a rejection) is still
 * useful (see apps/api/src/modules/message/index.ts for the access check).
 */
export const MessageSchema = z
  .object({
    id: z.string().uuid(),
    bookingId: z.string(),
    senderId: z.string(),
    body: z.string().min(1).max(2000),
    createdAt: z.string().describe('ISO-8601 timestamp'),
  })
  .describe('Message');
export type Message = z.infer<typeof MessageSchema>;

/**
 * Payload for `POST /bookings/:bookingId/messages`. `bookingId` comes from
 * the route param and `senderId` from the caller's session — neither is
 * trusted from the request body.
 */
export const CreateMessageSchema = z
  .object({
    body: z.string().min(1).max(2000),
  })
  .describe('CreateMessage');
export type CreateMessage = z.infer<typeof CreateMessageSchema>;

export const MessagePageSchema = paginatedSchema(MessageSchema).describe('MessagePage');
