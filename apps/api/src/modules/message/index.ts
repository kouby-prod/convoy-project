import { OpenAPIHono } from '@hono/zod-openapi';
import { asc, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { requireAuth, getAuth, type AuthEnv } from '../../auth';
import { db } from '../../db/client';
import { message } from '../../db/message';
import { booking, trajet } from '../../db/trajet-schema';
import type { Message } from '@carpool/schemas';
import { listBookingMessagesRoute, createBookingMessageRoute } from './message.routes';
import { notifyUser, trajetUrl, describeTrip } from '../trajet/notifications';

/**
 * Message module — an `OpenAPIHono` sub-app mounted by app.ts (see
 * apps/api/src/modules/README.md). It is exported as the CHAINED result of
 * `.openapi(...)` so its route types flow into `AppType` (the RPC client and
 * Swagger). Exporting the bare `new OpenAPIHono()` would drop the route types
 * and `api.bookings` would not exist on the typed client.
 */
const app = new OpenAPIHono<AuthEnv>();

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

    const recipientId = user.id === access.passengerId ? access.driverId : access.passengerId;
    await notifyUser(
      recipientId,
      'New message on your Carpool trip',
      `You have a new message about the trip from ${describeTrip(access.trip)}: "${text}". ` +
        `Reply here: ${trajetUrl(access.trajetId)}`,
    );

    return c.json(serialize(created), 201);
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
