ALTER TABLE "reconciliation_mismatch" ADD COLUMN "status" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "reconciliation_mismatch" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "reconciliation_mismatch" ADD COLUMN "resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "reconciliation_mismatch" ADD COLUMN "resolved_by" text;--> statement-breakpoint
ALTER TABLE "reconciliation_mismatch" ADD CONSTRAINT "reconciliation_mismatch_status_check" CHECK ("reconciliation_mismatch"."status" in ('open', 'resolved'));--> statement-breakpoint
CREATE INDEX "reconciliation_mismatch_status_idx" ON "reconciliation_mismatch" USING btree ("status");--> statement-breakpoint
ALTER TABLE "driver_payout" DROP CONSTRAINT "driver_payout_status_check";--> statement-breakpoint
ALTER TABLE "driver_payout" ADD CONSTRAINT "driver_payout_status_check" CHECK ("driver_payout"."status" in ('held', 'due', 'paid', 'cancelled', 'frozen'));
