CREATE TABLE "driver_payout" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"driver_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"due_at" timestamp NOT NULL,
	"paid_at" timestamp,
	"paid_ref" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "driver_payout_booking_id_unique" UNIQUE("booking_id"),
	CONSTRAINT "driver_payout_status_check" CHECK ("driver_payout"."status" in ('held', 'due', 'paid', 'cancelled')),
	CONSTRAINT "driver_payout_amount_check" CHECK ("driver_payout"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "ledger_entry" DROP CONSTRAINT "ledger_entry_account_check";--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "fare_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "commission_cents" integer DEFAULT 500 NOT NULL;--> statement-breakpoint
UPDATE "invoice" SET "commission_cents" = "subtotal_cents" WHERE "fare_cents" = 0;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "payment_method" text DEFAULT 'cash' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "fare_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "trajet" ADD COLUMN "payment_methods" text[] DEFAULT '{"card","interac","cash"}' NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_payout" ADD CONSTRAINT "driver_payout_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_payout" ADD CONSTRAINT "driver_payout_driver_id_user_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "driver_payout_status_idx" ON "driver_payout" USING btree ("status");--> statement-breakpoint
CREATE INDEX "driver_payout_driver_idx" ON "driver_payout" USING btree ("driver_id");--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_account_check" CHECK ("ledger_entry"."account" in ('accounts_receivable', 'processor_clearing', 'revenue', 'tax_payable', 'refunds', 'driver_payable'));--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_payment_method_check" CHECK ("booking"."payment_method" in ('card', 'interac', 'cash'));