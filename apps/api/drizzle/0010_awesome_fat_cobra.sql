CREATE SEQUENCE "public"."credit_note_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."invoice_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "credit_note" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"number" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_note_invoice_id_unique" UNIQUE("invoice_id"),
	CONSTRAINT "credit_note_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "idempotency_key" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_key_user_key_unique" UNIQUE("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"number" text NOT NULL,
	"status" text NOT NULL,
	"currency" text NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"tax_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"tax_lines" jsonb NOT NULL,
	"buyer_name" text NOT NULL,
	"buyer_email" text NOT NULL,
	"pdf_storage_key" text,
	"issued_at" timestamp NOT NULL,
	"due_at" timestamp NOT NULL,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_booking_id_unique" UNIQUE("booking_id"),
	CONSTRAINT "invoice_number_unique" UNIQUE("number"),
	CONSTRAINT "invoice_status_check" CHECK ("invoice"."status" in ('draft', 'issued', 'paid', 'voided'))
);
--> statement-breakpoint
CREATE TABLE "ledger_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"txn_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"account" text NOT NULL,
	"direction" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entry_account_check" CHECK ("ledger_entry"."account" in ('accounts_receivable', 'processor_clearing', 'revenue', 'tax_payable', 'refunds')),
	CONSTRAINT "ledger_entry_direction_check" CHECK ("ledger_entry"."direction" in ('debit', 'credit')),
	CONSTRAINT "ledger_entry_amount_check" CHECK ("ledger_entry"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_payment_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_provider_payment_id_unique" UNIQUE("provider","provider_payment_id"),
	CONSTRAINT "payment_provider_check" CHECK ("payment"."provider" in ('stripe', 'paypal')),
	CONSTRAINT "payment_status_check" CHECK ("payment"."status" in ('created', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded'))
);
--> statement-breakpoint
CREATE TABLE "processed_event" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	CONSTRAINT "processed_event_provider_event_unique" UNIQUE("provider","event_id"),
	CONSTRAINT "processed_event_provider_check" CHECK ("processed_event"."provider" in ('stripe', 'paypal')),
	CONSTRAINT "processed_event_status_check" CHECK ("processed_event"."status" in ('received', 'processed'))
);
--> statement-breakpoint
CREATE TABLE "reconciliation_mismatch" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"provider" text,
	"provider_payment_id" text,
	"invoice_id" text,
	"detail" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking" DROP CONSTRAINT "booking_status_check";--> statement-breakpoint
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_status_idx" ON "invoice" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ledger_entry_txn_idx" ON "ledger_entry" USING btree ("txn_id");--> statement-breakpoint
CREATE INDEX "ledger_entry_invoice_idx" ON "ledger_entry" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_one_succeeded_per_invoice" ON "payment" USING btree ("invoice_id") WHERE "payment"."status" = 'succeeded';--> statement-breakpoint
CREATE INDEX "payment_invoice_idx" ON "payment" USING btree ("invoice_id");--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_status_check" CHECK ("booking"."status" in ('pending', 'awaiting_payment', 'confirmed', 'rejected', 'cancelled', 'expired'));