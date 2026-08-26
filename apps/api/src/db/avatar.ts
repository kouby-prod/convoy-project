import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

/**
 * Profile photo — stored like a vehicle photo (S3 key + mime), not on
 * auth-schema.ts. `user.image` is also set to the key (or a Google HTTPS URL)
 * so the session can tell whether an avatar exists.
 */
export const userAvatar = pgTable('user_avatar', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull(),
  mimeType: text('mime_type').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const userAvatarRelations = relations(userAvatar, ({ one }) => ({
  user: one(user, {
    fields: [userAvatar.userId],
    references: [user.id],
  }),
}));
