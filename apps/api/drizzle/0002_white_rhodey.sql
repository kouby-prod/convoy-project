ALTER TABLE "booking" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "message" text;--> statement-breakpoint
ALTER TABLE "trajet" ADD COLUMN "departure_place" text;--> statement-breakpoint
ALTER TABLE "trajet" ADD COLUMN "arrival_place" text;--> statement-breakpoint
ALTER TABLE "trajet" ADD COLUMN "arrival_at" timestamp;--> statement-breakpoint
ALTER TABLE "trajet" ADD COLUMN "amenities" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "trajet" ADD COLUMN "has_intermediate_stop" boolean DEFAULT false NOT NULL;