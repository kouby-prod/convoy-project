import { relations, sql } from 'drizzle-orm';
import { pgTable, text, integer, timestamp, check } from 'drizzle-orm/pg-core';
import { trajet, booking } from './trajet-schema';
import { user } from './auth-schema';

/**
 * `review` table — a passenger's rating of a driver for one completed,
 * confirmed booking. `bookingId` is unique: at most one review per booking.
 * After editing the columns, regenerate + apply the migration:
 * `pnpm --filter @carpool/api db:generate` then `db:migrate`.
 */
export const review = pgTable(
  'review',
  {
    id: text('id').primaryKey(),
    trajetId: text('trajet_id').notNull().references(() => trajet.id, { onDelete: 'cascade' }),
    bookingId: text('booking_id')
      .notNull()
      .unique()
      .references(() => booking.id, { onDelete: 'cascade' }),
    driverId: text('driver_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    passengerId: text('passenger_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [check('review_rating_check', sql`${t.rating} >= 1 AND ${t.rating} <= 5`)],
);

export const reviewRelations = relations(review, ({ one }) => ({
  trajet: one(trajet, { fields: [review.trajetId], references: [trajet.id] }),
  booking: one(booking, { fields: [review.bookingId], references: [booking.id] }),
  driver: one(user, { fields: [review.driverId], references: [user.id] }),
  passenger: one(user, { fields: [review.passengerId], references: [user.id] }),
}));
