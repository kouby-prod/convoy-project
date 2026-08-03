ALTER TABLE "review" DROP CONSTRAINT "review_booking_id_unique";--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "direction" text NOT NULL;--> statement-breakpoint
CREATE INDEX "review_passenger_idx" ON "review" USING btree ("passenger_id");--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_booking_id_direction_unique" UNIQUE("booking_id","direction");--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_direction_check" CHECK ("review"."direction" in ('passenger_to_driver', 'driver_to_passenger'));