import { relations } from 'drizzle-orm';
import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

/**
 * `vehicle` — the car description a passenger sees on a ride, as declared by
 * the driver on the ad-creation "Étape 2" screen.
 *
 * One row per driver — `ownerId` is the primary key, so a correction
 * upserts rather than accumulates (same reasoning as `driver_eligibility`:
 * a car's colour or plate is a fact, not a submission). Proof of
 * registration is the separate `immatriculation` row in `driver_document`;
 * this table is only the description, never the file.
 *
 * After editing the columns, regenerate + apply the migration:
 * `pnpm --filter @carpool/api db:generate` then `db:migrate`.
 */
export const vehicle = pgTable('vehicle', {
  ownerId: text('owner_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  make: text('make').notNull(),
  model: text('model').notNull(),
  color: text('color').notNull(),
  seats: integer('seats').notNull(),
  plate: text('plate').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const vehicleRelations = relations(vehicle, ({ one }) => ({
  driver: one(user, {
    fields: [vehicle.ownerId],
    references: [user.id],
  }),
}));
