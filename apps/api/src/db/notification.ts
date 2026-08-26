import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, index, uuid, boolean } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

export const notification = pgTable(
  'notification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    channel: text('channel').notNull().default('email'),
    type: text('type').notNull().default('system'),
    link: text('link'),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [index('notification_user_idx').on(table.userId)],
);

export const notificationRelations = relations(notification, ({ one }) => ({
  user: one(user, {
    fields: [notification.userId],
    references: [user.id],
  }),
}));

/**
 * Per-user channel switches. One row per account (`userId` PK); missing row
 * means both channels on (see `DEFAULT_NOTIFICATION_PREFERENCE`). Cascade
 * with the user so prefs never outlive the account.
 */
export const notificationPreference = pgTable('notification_preference', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  emailEnabled: boolean('email_enabled').notNull().default(true),
  inAppEnabled: boolean('in_app_enabled').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const notificationPreferenceRelations = relations(notificationPreference, ({ one }) => ({
  user: one(user, {
    fields: [notificationPreference.userId],
    references: [user.id],
  }),
}));
