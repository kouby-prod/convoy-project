import { relations } from 'drizzle-orm';
import { pgTable, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

/**
 * `vehicle` — the car description a passenger sees on a ride, as declared by
 * the driver on the ad-creation "Étape 3" (description) and "Étape 4"
 * (insurance) screens.
 *
 * `plate` is the only mandatory description field — it alone satisfies
 * registration, the same way `hasInsurance` alone satisfies insurance.
 * `make`/`model`/`color`/`seats`/`photoKey` are all optional: a passenger sees
 * them when the driver bothered to fill them in, and the UI omits each one
 * that is still null rather than showing invented data. None of the five is a
 * reviewed upload; there is no `driver_document` row for any of them.
 *
 * One row per driver — `ownerId` is the primary key, so a correction
 * upserts rather than accumulates (same reasoning as `driver_eligibility`:
 * a car's colour, plate, or insurance status is a fact, not a submission).
 *
 * After editing the columns, regenerate + apply the migration:
 * `pnpm --filter @carpool/api db:generate` then `db:migrate`.
 */
export const vehicle = pgTable('vehicle', {
  ownerId: text('owner_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  make: text('make'),
  model: text('model'),
  color: text('color'),
  seats: integer('seats'),
  /** The only mandatory description field — see the table doc comment above. */
  plate: text('plate').notNull(),
  /** The driver's own "yes/no" declaration — null until they answer it. */
  hasInsurance: boolean('has_insurance'),
  /** Storage key of an optional photo, uploaded the same way as a driver document. Null until one is sent. */
  photoKey: text('photo_key'),
  /** The uploaded photo's declared MIME type — needed to serve it back with the right `Content-Type`. */
  photoMimeType: text('photo_mime_type'),
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
