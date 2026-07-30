import { OpenAPIHono } from '@hono/zod-openapi';
import { avg, count, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { requireAuth, getAuth, type AuthEnv } from '../../auth';
import { db } from '../../db/client';
import { review } from '../../db/review';
import { trajet, booking } from '../../db/trajet-schema';
import type { Review, RatingSummary } from '@carpool/schemas';
import { createReviewRoute, listDriverReviewsRoute, getDriverRatingRoute } from './review.routes';

/**
 * Review module — an `OpenAPIHono` sub-app mounted by app.ts (see
 * apps/api/src/modules/README.md). It is exported as the CHAINED result of
 * `.openapi(...)` so its route types flow into `AppType` (the RPC client and
 * Swagger). Exporting the bare `new OpenAPIHono()` would drop the route types
 * and `api.review` would not exist on the typed client.
 */
const app = new OpenAPIHono<AuthEnv>();

// Rating a booking is the only mutation here; reading a driver's reviews and
// rating summary is public.
app.use('/reviews', requireAuth);

export const reviewModule = app
  .openapi(createReviewRoute, async (c) => {
    const { user } = getAuth(c);
    const body = c.req.valid('json');

    const [bookingRow] = await db.select().from(booking).where(eq(booking.id, body.bookingId));
    if (!bookingRow) return c.json({ error: 'Booking not found' }, 404);
    if (bookingRow.passengerId !== user.id) {
      return c.json({ error: 'Not your booking' }, 403);
    }
    if (bookingRow.status !== 'confirmed') {
      return c.json({ error: 'Booking is not confirmed' }, 400);
    }

    const [trajetRow] = await db.select().from(trajet).where(eq(trajet.id, bookingRow.trajetId));
    if (!trajetRow) return c.json({ error: 'Booking not found' }, 404);
    if (trajetRow.departureAt.getTime() > Date.now()) {
      return c.json({ error: "Cannot review a trip that hasn't happened yet" }, 400);
    }

    const [existing] = await db.select().from(review).where(eq(review.bookingId, body.bookingId));
    if (existing) {
      return c.json({ error: 'This booking has already been reviewed' }, 400);
    }

    const [created] = await db
      .insert(review)
      .values({
        id: randomUUID(),
        trajetId: trajetRow.id,
        bookingId: body.bookingId,
        driverId: trajetRow.driverId,
        passengerId: user.id,
        rating: body.rating,
        comment: body.comment ?? null,
      })
      .returning();
    if (!created) throw new Error('Insert returned no row'); // narrows away `undefined`
    return c.json(serialize(created), 201);
  })
  .openapi(listDriverReviewsRoute, async (c) => {
    const { driverId } = c.req.valid('param');
    const { page, limit } = c.req.valid('query');

    const rows = await db
      .select()
      .from(review)
      .where(eq(review.driverId, driverId))
      .limit(limit + 1)
      .offset((page - 1) * limit);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return c.json({ items: items.map(serialize), page, limit, hasMore }, 200);
  })
  .openapi(getDriverRatingRoute, async (c) => {
    const { driverId } = c.req.valid('param');

    const [summary] = await db
      .select({ averageRating: avg(review.rating), reviewCount: count(review.rating) })
      .from(review)
      .where(eq(review.driverId, driverId));

    const result: RatingSummary = {
      averageRating: summary?.averageRating ? Number(summary.averageRating) : null,
      reviewCount: summary?.reviewCount ?? 0,
    };
    return c.json(result, 200);
  });

/** Map a DB row (Date columns) to the Zod contract shape (ISO strings). */
function serialize(row: typeof review.$inferSelect): Review {
  return {
    id: row.id,
    trajetId: row.trajetId,
    bookingId: row.bookingId,
    driverId: row.driverId,
    passengerId: row.passengerId,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
