import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  integer,
  numeric,
  boolean,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

export const trajet = pgTable('trajet', {
  id: text('id').primaryKey(),
  driverId: text('driver_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  departureCity: text('departure_city').notNull(),
  arrivalCity: text('arrival_city').notNull(),
  // Geocoded server-side from the city names on create/update (see
  // apps/api/src/modules/trajet/geocoding.ts) — nullable because geocoding is
  // best-effort against a third-party service and must never block publishing
  // a trajet. Powers the `nearLat`/`nearLng`/`radiusKm` proximity search.
  departureLat: numeric('departure_lat'),
  departureLng: numeric('departure_lng'),
  arrivalLat: numeric('arrival_lat'),
  arrivalLng: numeric('arrival_lng'),
  departureAt: timestamp('departure_at').notNull(),
  /** Pickup / drop-off points and the estimated arrival — optional, the short
      /annoncer form does not collect them. */
  departurePlace: text('departure_place'),
  arrivalPlace: text('arrival_place'),
  arrivalAt: timestamp('arrival_at'),
  seatsTotal: integer('seats_total').notNull(),
  seatsAvailable: integer('seats_available').notNull(),
  pricePerSeat: numeric('price_per_seat').notNull(),
  description: text('description'),
  comfort: text('comfort'),
  baggageAllowance: text('baggage_allowance'),
  /** Advertised options, stored as the `TrajetAmenity` string values. */
  amenities: text('amenities').array().notNull().default([]),
  /** Fare settlement methods the driver accepts: card, interac, cash. */
  paymentMethods: text('payment_methods').array().notNull().default(['card', 'interac', 'cash']),
  hasIntermediateStop: boolean('has_intermediate_stop').notNull().default(false),
  cancelledAt: timestamp('cancelled_at'),
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
    paymentMethod: text('payment_method').notNull().default('cash'),
    fareCents: integer('fare_cents').notNull().default(0),
    /** Contact details as typed on the ride detail form. The passenger identity
        is `passengerId`; these are what the driver is shown. */
    firstName: text('first_name'),
    lastName: text('last_name'),
    email: text('email'),
    phone: text('phone'),
    message: text('message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    index('booking_trajet_idx').on(t.trajetId),
    index('booking_passenger_idx').on(t.passengerId),
    check(
      'booking_status_check',
      sql`${t.status} in ('pending', 'awaiting_payment', 'confirmed', 'rejected', 'cancelled', 'expired')`,
    ),
    check(
      'booking_payment_method_check',
      sql`${t.paymentMethod} in ('card', 'interac', 'cash')`,
    ),
  ],
);

export const trajetRelations = relations(trajet, ({ many, one }) => ({
  bookings: many(booking),
  driver: one(user, { fields: [trajet.driverId], references: [user.id] }),
}));

export const bookingRelations = relations(booking, ({ one }) => ({
  trajet: one(trajet, { fields: [booking.trajetId], references: [trajet.id] }),
  passenger: one(user, { fields: [booking.passengerId], references: [user.id] }),
}));
