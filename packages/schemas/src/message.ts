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

/**
 * One inbox row for `GET /messages/conversations` — a booking thread the
 * caller can access, with enough trip/counterpart context to render a list
 * without a second round-trip.
 */
export const ConversationSchema = z
  .object({
    bookingId: z.string(),
    trajetId: z.string(),
    role: z.enum(['driver', 'passenger']),
    bookingStatus: z.string(),
    counterpart: z.object({
      id: z.string(),
      name: z.string(),
    }),
    trip: z.object({
      departureCity: z.string(),
      arrivalCity: z.string(),
      departureAt: z.string().describe('ISO-8601 timestamp'),
    }),
    lastMessage: MessageSchema.nullable(),
  })
  .describe('Conversation');
export type Conversation = z.infer<typeof ConversationSchema>;

export const ConversationPageSchema = paginatedSchema(ConversationSchema).describe('ConversationPage');

/**
 * Client → server frames on `GET /ws/messages`. Auth is established at
 * upgrade time (Bearer token query/header or session cookie); these frames
 * only manage which booking threads the socket listens to.
 */
export const WsClientFrameSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('subscribe'),
    bookingId: z.string().uuid(),
  }),
  z.object({
    type: z.literal('unsubscribe'),
    bookingId: z.string().uuid(),
  }),
  z.object({
    type: z.literal('ping'),
  }),
]);
export type WsClientFrame = z.infer<typeof WsClientFrameSchema>;

/**
 * Server → client frames on `GET /ws/messages`. History stays on REST;
 * sockets only push live `message.created` events after a successful
 * subscribe.
 */
export const WsServerFrameSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('subscribed'),
    bookingId: z.string(),
  }),
  z.object({
    type: z.literal('unsubscribed'),
    bookingId: z.string(),
  }),
  z.object({
    type: z.literal('message.created'),
    message: MessageSchema,
  }),
  z.object({
    type: z.literal('pong'),
  }),
  z.object({
    type: z.literal('error'),
    error: z.string(),
    bookingId: z.string().optional(),
  }),
]);
export type WsServerFrame = z.infer<typeof WsServerFrameSchema>;
