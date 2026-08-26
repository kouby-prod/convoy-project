import { relations } from 'drizzle-orm';
import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

/**
 * Soft-delete hold. The user row stays until `purgeAt`; they can sign in and
 * cancel. Cascade with the user so a completed wipe never leaves this row.
 */
export const accountDeletion = pgTable(
  'account_deletion',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    purgeAt: timestamp('purge_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('account_deletion_purge_at_idx').on(t.purgeAt)],
);

export const accountDeletionRelations = relations(accountDeletion, ({ one }) => ({
  user: one(user, {
    fields: [accountDeletion.userId],
    references: [user.id],
  }),
}));
