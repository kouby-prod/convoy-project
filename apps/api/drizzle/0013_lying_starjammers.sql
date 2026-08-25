ALTER TABLE "vehicle" ALTER COLUMN "make" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicle" ALTER COLUMN "model" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicle" ALTER COLUMN "color" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicle" ALTER COLUMN "seats" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_eligibility" ALTER COLUMN "date_of_birth" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicle" ADD COLUMN "photo_key" text;--> statement-breakpoint
ALTER TABLE "vehicle" ADD COLUMN "photo_mime_type" text;--> statement-breakpoint
ALTER TABLE "driver_eligibility" ADD COLUMN "license_number" text;