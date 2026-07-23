import { pgTable, uuid, text, timestamp, integer, numeric } from 'drizzle-orm/pg-core';

/**
 * `trajet` table. After editing the columns, regenerate + apply the
 * migration: `pnpm --filter @carpool/api db:generate` then `db:migrate`.
 * Do not hand-edit auth-schema.ts (it is BetterAuth CLI-generated).
 */
export const trajet = pgTable('trajet', {
  id: uuid('id').primaryKey().defaultRandom(),
  driverId: text('driver_id').notNull(),
  departureCity: text('departure_city').notNull(),
  arrivalCity: text('arrival_city').notNull(),
  departureAt: timestamp('departure_at', { withTimezone: true }).notNull(),
  seatsTotal: integer('seats_total').notNull(),
  seatsAvailable: integer('seats_available').notNull(),
  pricePerSeat: numeric('price_per_seat').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .$onUpdate(() => new Date())
    .defaultNow(),
});
