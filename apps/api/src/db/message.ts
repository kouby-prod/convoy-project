import { relations, sql } from 'drizzle-orm';
import { pgTable, text, timestamp, index, check } from 'drizzle-orm/pg-core';
import { booking } from './trajet-schema';
import { user } from './auth-schema';

/**
 * `message` table — one message in a booking's thread between its passenger
 * and the trajet's driver. There is no separate "conversation" table: the
 * booking already identifies the two parties (its `passengerId` and the
 * trajet's `driverId`, looked up via `bookingId`).
 * After editing the columns, regenerate + apply the migration:
 * `pnpm --filter @carpool/api db:generate` then `db:migrate`.
 */
export const message = pgTable(
  'message',
  {
    id: text('id').primaryKey(),
    bookingId: text('booking_id')
      .notNull()
      .references(() => booking.id, { onDelete: 'cascade' }),
    senderId: text('sender_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('message_booking_idx').on(t.bookingId),
    check('message_body_check', sql`length(${t.body}) >= 1 AND length(${t.body}) <= 2000`),
  ],
);

export const messageRelations = relations(message, ({ one }) => ({
  booking: one(booking, { fields: [message.bookingId], references: [booking.id] }),
  sender: one(user, { fields: [message.senderId], references: [user.id] }),
}));
