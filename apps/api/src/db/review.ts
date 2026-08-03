import { relations, sql } from 'drizzle-orm';
import { pgTable, text, integer, timestamp, check, unique, index } from 'drizzle-orm/pg-core';
import { trajet, booking } from './trajet-schema';
import { user } from './auth-schema';

/**
 * `review` table — a rating between the two parties of one completed,
 * confirmed booking: either the passenger rating the driver
 * (`passenger_to_driver`) or the driver rating the passenger
 * (`driver_to_passenger`). `driverId`/`passengerId` always identify the
 * trip's two parties regardless of direction; `direction` says who rated
 * whom. At most one review per booking per direction (unique on
 * `booking_id, direction`, not on `booking_id` alone).
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
      .references(() => booking.id, { onDelete: 'cascade' }),
    driverId: text('driver_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    passengerId: text('passenger_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    direction: text('direction').notNull(),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    unique('review_booking_id_direction_unique').on(t.bookingId, t.direction),
    index('review_passenger_idx').on(t.passengerId),
    check('review_rating_check', sql`${t.rating} >= 1 AND ${t.rating} <= 5`),
    check(
      'review_direction_check',
      sql`${t.direction} in ('passenger_to_driver', 'driver_to_passenger')`,
    ),
  ],
);

export const reviewRelations = relations(review, ({ one }) => ({
  trajet: one(trajet, { fields: [review.trajetId], references: [trajet.id] }),
  booking: one(booking, { fields: [review.bookingId], references: [booking.id] }),
  driver: one(user, { fields: [review.driverId], references: [user.id] }),
  passenger: one(user, { fields: [review.passengerId], references: [user.id] }),
}));
