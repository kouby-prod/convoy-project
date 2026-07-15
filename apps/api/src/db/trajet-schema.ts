import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  integer,
  numeric,
  index,
} from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

export const trajet = pgTable('trajet', {
  id: text('id').primaryKey(),
  driverId: text('driver_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  departureCity: text('departure_city').notNull(),
  arrivalCity: text('arrival_city').notNull(),
  departureAt: timestamp('departure_at').notNull(),
  seatsTotal: integer('seats_total').notNull(),
  seatsAvailable: integer('seats_available').notNull(),
  pricePerSeat: numeric('price_per_seat').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
});

export const booking = pgTable(
  'booking',
  {
    id: text('id').primaryKey(),
    trajetId: text('trajet_id').notNull().references(() => trajet.id, { onDelete: 'cascade' }),
    passengerId: text('passenger_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    seats: integer('seats').notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [index('booking_trajet_idx').on(t.trajetId), index('booking_passenger_idx').on(t.passengerId)],
);

export const trajetRelations = relations(trajet, ({ many, one }) => ({
  bookings: many(booking),
  driver: one(user, { fields: [trajet.driverId], references: [user.id] }),
}));

export const bookingRelations = relations(booking, ({ one }) => ({
  trajet: one(trajet, { fields: [booking.trajetId], references: [trajet.id] }),
  passenger: one(user, { fields: [booking.passengerId], references: [user.id] }),
}));
