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
 * means every channel on (see `DEFAULT_NOTIFICATION_PREFERENCE`). Cascade
 * with the user so prefs never outlive the account.
 */
export const notificationPreference = pgTable('notification_preference', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  emailEnabled: boolean('email_enabled').notNull().default(true),
  inAppEnabled: boolean('in_app_enabled').notNull().default(true),
  pushEnabled: boolean('push_enabled').notNull().default(true),
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

/**
 * One row per browser `PushSubscription` (a user can have several — one per
 * device/browser). `endpoint` is globally unique per the Push API spec, so
 * it's the natural upsert key: re-subscribing the same endpoint just
 * refreshes the keys instead of duplicating the row.
 */
export const webPushSubscription = pgTable(
  'web_push_subscription',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('web_push_subscription_user_idx').on(table.userId)],
);

export const webPushSubscriptionRelations = relations(webPushSubscription, ({ one }) => ({
  user: one(user, {
    fields: [webPushSubscription.userId],
    references: [user.id],
  }),
}));
