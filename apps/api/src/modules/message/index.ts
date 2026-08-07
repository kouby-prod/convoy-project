import { OpenAPIHono } from '@hono/zod-openapi';
import { asc, desc, eq, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { randomUUID } from 'crypto';
import { requireAuth, getAuth, type AuthEnv } from '../../auth';
import { db } from '../../db/client';
import { message } from '../../db/message';
import { booking, trajet } from '../../db/trajet-schema';
import { user } from '../../db/auth-schema';
import type { Conversation, Message } from '@carpool/schemas';
import {
  listConversationsRoute,
  listBookingMessagesRoute,
  createBookingMessageRoute,
} from './message.routes';
import { enqueueMessageNotify } from '../../queue/message-jobs';

/**
 * Message module — an `OpenAPIHono` sub-app mounted by app.ts (see
 * apps/api/src/modules/README.md). It is exported as the CHAINED result of
 * `.openapi(...)` so its route types flow into `AppType` (the RPC client and
 * Swagger). Exporting the bare `new OpenAPIHono()` would drop the route types
 * and `api.bookings` would not exist on the typed client.
 *
 * Real-time delivery is NOT handled here: after persist, POST enqueues a
 * BullMQ job that publishes Redis pub/sub (WebSocket hubs) and sends email.
 * Clients connect to `GET /ws/messages` (see realtime/messages-ws.ts).
 */
const app = new OpenAPIHono<AuthEnv>();

app.use('/messages/conversations', requireAuth);
// Both reading and posting to a booking's thread require being one of its
// two parties — there is no public read like the trajet/review modules have.
app.use('/bookings/:bookingId/messages', requireAuth);

type BookingAccess =
  | {
      ok: true;
      passengerId: string;
      driverId: string;
      trajetId: string;
      trip: { departureCity: string; arrivalCity: string; departureAt: Date };
    }
  | { ok: false; status: 403 | 404; error: string };

/**
 * Same booking → trajet → role-check shape as the review module: a booking
 * only names its passenger directly, so the trajet's driver has to be looked
 * up via `booking.trajetId` before the caller's role can be decided. Messaging
 * doesn't gate on booking status (unlike reviews) — either party may reach
 * out about a pending, confirmed, or even rejected/cancelled request.
 */
async function resolveBookingAccess(bookingId: string, userId: string): Promise<BookingAccess> {
  const [bookingRow] = await db.select().from(booking).where(eq(booking.id, bookingId));
  if (!bookingRow) return { ok: false, status: 404, error: 'Booking not found' };

  const [trajetRow] = await db.select().from(trajet).where(eq(trajet.id, bookingRow.trajetId));
  if (!trajetRow) return { ok: false, status: 404, error: 'Booking not found' };

  if (userId !== bookingRow.passengerId && userId !== trajetRow.driverId) {
    return { ok: false, status: 403, error: 'Neither the passenger nor the driver of this booking' };
  }

  return {
    ok: true,
    passengerId: bookingRow.passengerId,
    driverId: trajetRow.driverId,
    trajetId: trajetRow.id,
    trip: {
      departureCity: trajetRow.departureCity,
      arrivalCity: trajetRow.arrivalCity,
      departureAt: trajetRow.departureAt,
    },
  };
}

export const messageModule = app
  .openapi(listConversationsRoute, async (c) => {
    const { user: me } = getAuth(c);
    const { page, limit } = c.req.valid('query');

    // Two aliases so one query can resolve both parties' display names.
    const passenger = alias(user, 'passenger');
    const driver = alias(user, 'driver');

    // Latest message per booking via DISTINCT ON (Postgres), then join the
    // booking/trajet/users the caller is allowed to see.
    const lastMessage = db
      .selectDistinctOn([message.bookingId], {
        bookingId: message.bookingId,
        id: message.id,
        senderId: message.senderId,
        body: message.body,
        createdAt: message.createdAt,
      })
      .from(message)
      .orderBy(message.bookingId, desc(message.createdAt))
      .as('last_message');

    const rows = await db
      .select({
        bookingId: booking.id,
        trajetId: booking.trajetId,
        bookingStatus: booking.status,
        passengerId: booking.passengerId,
        driverId: trajet.driverId,
        departureCity: trajet.departureCity,
        arrivalCity: trajet.arrivalCity,
        departureAt: trajet.departureAt,
        passengerName: passenger.name,
        driverName: driver.name,
        lastMessageId: lastMessage.id,
        lastMessageSenderId: lastMessage.senderId,
        lastMessageBody: lastMessage.body,
        lastMessageCreatedAt: lastMessage.createdAt,
      })
      .from(booking)
      .innerJoin(trajet, eq(booking.trajetId, trajet.id))
      .innerJoin(passenger, eq(booking.passengerId, passenger.id))
      .innerJoin(driver, eq(trajet.driverId, driver.id))
      .leftJoin(lastMessage, eq(lastMessage.bookingId, booking.id))
      .where(or(eq(booking.passengerId, me.id), eq(trajet.driverId, me.id)))
      .orderBy(sql`coalesce(${lastMessage.createdAt}, ${booking.createdAt}) desc`)
      .limit(limit + 1)
      .offset((page - 1) * limit);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const items: Conversation[] = pageRows.map((row) => {
      const role = row.driverId === me.id ? 'driver' : 'passenger';
      const counterpart =
        role === 'driver'
          ? { id: row.passengerId, name: row.passengerName }
          : { id: row.driverId, name: row.driverName };

      const last: Message | null =
        row.lastMessageId &&
        row.lastMessageSenderId &&
        row.lastMessageBody &&
        row.lastMessageCreatedAt
          ? {
              id: row.lastMessageId,
              bookingId: row.bookingId,
              senderId: row.lastMessageSenderId,
              body: row.lastMessageBody,
              createdAt: row.lastMessageCreatedAt.toISOString(),
            }
          : null;

      return {
        bookingId: row.bookingId,
        trajetId: row.trajetId,
        role,
        bookingStatus: row.bookingStatus,
        counterpart,
        trip: {
          departureCity: row.departureCity,
          arrivalCity: row.arrivalCity,
          departureAt: row.departureAt.toISOString(),
        },
        lastMessage: last,
      };
    });

    return c.json({ items, page, limit, hasMore }, 200);
  })
  .openapi(listBookingMessagesRoute, async (c) => {
    const { user } = getAuth(c);
    const { bookingId } = c.req.valid('param');
    const { page, limit } = c.req.valid('query');

    const access = await resolveBookingAccess(bookingId, user.id);
    if (!access.ok) return c.json({ error: access.error }, access.status);

    const rows = await db
      .select()
      .from(message)
      .where(eq(message.bookingId, bookingId))
      .orderBy(asc(message.createdAt))
      .limit(limit + 1)
      .offset((page - 1) * limit);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return c.json({ items: items.map(serialize), page, limit, hasMore }, 200);
  })
  .openapi(createBookingMessageRoute, async (c) => {
    const { user } = getAuth(c);
    const { bookingId } = c.req.valid('param');
    const { body: text } = c.req.valid('json');

    const access = await resolveBookingAccess(bookingId, user.id);
    if (!access.ok) return c.json({ error: access.error }, access.status);

    const [created] = await db
      .insert(message)
      .values({ id: randomUUID(), bookingId, senderId: user.id, body: text })
      .returning();
    if (!created) throw new Error('Insert returned no row'); // narrows away `undefined`

    const serialized = serialize(created);
    const recipientId = user.id === access.passengerId ? access.driverId : access.passengerId;

    // Persist first, then enqueue best-effort. A Redis blip must not turn a
    // successful insert into a non-201 (clients would retry and duplicate).
    try {
      await enqueueMessageNotify({
        message: serialized,
        recipientId,
        trajetId: access.trajetId,
        trip: {
          departureCity: access.trip.departureCity,
          arrivalCity: access.trip.arrivalCity,
          departureAt: access.trip.departureAt.toISOString(),
        },
      });
    } catch (err) {
      console.error('[message] failed to enqueue notify job', err);
    }

    return c.json(serialized, 201);
  });


/** Map a DB row (Date columns) to the Zod contract shape (ISO strings). */
function serialize(row: typeof message.$inferSelect): Message {
  return {
    id: row.id,
    bookingId: row.bookingId,
    senderId: row.senderId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}
