ALTER TABLE "invoice" DROP CONSTRAINT "invoice_booking_id_booking_id_fk";--> statement-breakpoint
ALTER TABLE "credit_note" DROP CONSTRAINT "credit_note_invoice_id_invoice_id_fk";--> statement-breakpoint
ALTER TABLE "payment" DROP CONSTRAINT "payment_invoice_id_invoice_id_fk";--> statement-breakpoint
ALTER TABLE "ledger_entry" DROP CONSTRAINT "ledger_entry_invoice_id_invoice_id_fk";--> statement-breakpoint
ALTER TABLE "driver_payout" DROP CONSTRAINT "driver_payout_booking_id_booking_id_fk";--> statement-breakpoint
ALTER TABLE "driver_payout" DROP CONSTRAINT "driver_payout_driver_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_payout" ADD CONSTRAINT "driver_payout_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_payout" ADD CONSTRAINT "driver_payout_driver_id_user_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
