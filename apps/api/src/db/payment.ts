import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  pgSequence,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  unique,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { booking } from './trajet-schema';
import { user } from './auth-schema';
import type { TaxLine } from '@carpool/schemas';

export const invoiceNumberSeq = pgSequence('invoice_number_seq');
export const creditNoteNumberSeq = pgSequence('credit_note_number_seq');

/**
 * Kouby-owned invoice — the document of record. Stripe/PayPal only collect.
 * Numbers come from `invoice_number_seq` (KOU-YYYY-000001). Never delete a
 * row: void an unpaid invoice or issue a credit note against a paid one.
 * Foreign keys use ON DELETE restrict so a booking/user wipe cannot erase
 * the ledger.
 */
export const invoice = pgTable(
  'invoice',
  {
    id: text('id').primaryKey(),
    bookingId: text('booking_id')
      .notNull()
      .references(() => booking.id, { onDelete: 'restrict' }),
    number: text('number').notNull(),
    status: text('status').notNull(),
    currency: text('currency').notNull(),
    subtotalCents: integer('subtotal_cents').notNull(),
    fareCents: integer('fare_cents').notNull().default(0),
    commissionCents: integer('commission_cents').notNull().default(400),
    taxCents: integer('tax_cents').notNull(),
    totalCents: integer('total_cents').notNull(),
    taxLines: jsonb('tax_lines').$type<TaxLine[]>().notNull(),
    buyerName: text('buyer_name').notNull(),
    buyerEmail: text('buyer_email').notNull(),
    pdfStorageKey: text('pdf_storage_key'),
    issuedAt: timestamp('issued_at').notNull(),
    dueAt: timestamp('due_at').notNull(),
    paidAt: timestamp('paid_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    unique('invoice_booking_id_unique').on(t.bookingId),
    unique('invoice_number_unique').on(t.number),
    index('invoice_status_idx').on(t.status),
    check(
      'invoice_status_check',
      sql`${t.status} in ('draft', 'issued', 'paid', 'voided')`,
    ),
  ],
);

export const creditNote = pgTable(
  'credit_note',
  {
    id: text('id').primaryKey(),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => invoice.id, { onDelete: 'restrict' }),
    number: text('number').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    unique('credit_note_invoice_id_unique').on(t.invoiceId),
    unique('credit_note_number_unique').on(t.number),
  ],
);

/**
 * One collection attempt against an invoice. Many rows per invoice are
 * allowed (passenger can try Stripe then PayPal) but at most one may be
 * `succeeded` — enforced by a partial unique index.
 */
export const payment = pgTable(
  'payment',
  {
    id: text('id').primaryKey(),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => invoice.id, { onDelete: 'restrict' }),
    provider: text('provider').notNull(),
    providerPaymentId: text('provider_payment_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    unique('payment_provider_payment_id_unique').on(t.provider, t.providerPaymentId),
    uniqueIndex('payment_one_succeeded_per_invoice')
      .on(t.invoiceId)
      .where(sql`${t.status} = 'succeeded'`),
    index('payment_invoice_idx').on(t.invoiceId),
    check('payment_provider_check', sql`${t.provider} in ('stripe', 'paypal')`),
    check(
      'payment_status_check',
      sql`${t.status} in ('created', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded')`,
    ),
  ],
);

export const ledgerEntry = pgTable(
  'ledger_entry',
  {
    id: text('id').primaryKey(),
    txnId: text('txn_id').notNull(),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => invoice.id, { onDelete: 'restrict' }),
    account: text('account').notNull(),
    direction: text('direction').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('ledger_entry_txn_idx').on(t.txnId),
    index('ledger_entry_invoice_idx').on(t.invoiceId),
    check(
      'ledger_entry_account_check',
      sql`${t.account} in ('accounts_receivable', 'processor_clearing', 'revenue', 'tax_payable', 'refunds', 'driver_payable')`,
    ),
    check('ledger_entry_direction_check', sql`${t.direction} in ('debit', 'credit')`),
    check('ledger_entry_amount_check', sql`${t.amountCents} > 0`),
  ],
);

export const processedEvent = pgTable(
  'processed_event',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    processedAt: timestamp('processed_at'),
  },
  (t) => [
    unique('processed_event_provider_event_unique').on(t.provider, t.eventId),
    check('processed_event_provider_check', sql`${t.provider} in ('stripe', 'paypal')`),
    check('processed_event_status_check', sql`${t.status} in ('received', 'processed')`),
  ],
);

export const idempotencyKey = pgTable(
  'idempotency_key',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    responseJson: jsonb('response_json').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [unique('idempotency_key_user_key_unique').on(t.userId, t.key)],
);

export const reconciliationMismatch = pgTable(
  'reconciliation_mismatch',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    provider: text('provider'),
    providerPaymentId: text('provider_payment_id'),
    invoiceId: text('invoice_id'),
    detail: jsonb('detail').notNull(),
    status: text('status').notNull().default('open'),
    note: text('note'),
    resolvedAt: timestamp('resolved_at'),
    resolvedBy: text('resolved_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('reconciliation_mismatch_status_idx').on(t.status),
    check(
      'reconciliation_mismatch_status_check',
      sql`${t.status} in ('open', 'resolved')`,
    ),
  ],
);

/**
 * Fare Kouby owes the driver after a card collection. Created on settle;
 * becomes `due` 24h after departure; marked `paid` by an admin (no Connect).
 * Restrict-on-delete: a user or booking wipe must not drop payout history.
 */
export const driverPayout = pgTable(
  'driver_payout',
  {
    id: text('id').primaryKey(),
    bookingId: text('booking_id')
      .notNull()
      .references(() => booking.id, { onDelete: 'restrict' }),
    driverId: text('driver_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    status: text('status').notNull(),
    dueAt: timestamp('due_at').notNull(),
    paidAt: timestamp('paid_at'),
    paidRef: text('paid_ref'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    unique('driver_payout_booking_id_unique').on(t.bookingId),
    index('driver_payout_status_idx').on(t.status),
    index('driver_payout_driver_idx').on(t.driverId),
    check(
      'driver_payout_status_check',
      sql`${t.status} in ('held', 'due', 'paid', 'cancelled', 'frozen')`,
    ),
    check('driver_payout_amount_check', sql`${t.amountCents} > 0`),
  ],
);

export const invoiceRelations = relations(invoice, ({ one, many }) => ({
  booking: one(booking, { fields: [invoice.bookingId], references: [booking.id] }),
  payments: many(payment),
  creditNote: one(creditNote),
  ledgerEntries: many(ledgerEntry),
}));

export const paymentRelations = relations(payment, ({ one }) => ({
  invoice: one(invoice, { fields: [payment.invoiceId], references: [invoice.id] }),
}));

export const creditNoteRelations = relations(creditNote, ({ one }) => ({
  invoice: one(invoice, { fields: [creditNote.invoiceId], references: [invoice.id] }),
}));

export const ledgerEntryRelations = relations(ledgerEntry, ({ one }) => ({
  invoice: one(invoice, { fields: [ledgerEntry.invoiceId], references: [invoice.id] }),
}));

/** Stripe Customer id for saved cards. Cascade with the user; the PSP still holds the cards. */
export const stripeCustomer = pgTable(
  'stripe_customer',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    customerId: text('customer_id').notNull(),
    defaultPaymentMethodId: text('default_payment_method_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('stripe_customer_customer_id_uidx').on(t.customerId)],
);
