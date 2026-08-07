CREATE TABLE "driver_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"expires_on" date,
	"review_note" text,
	"age_confirmed" boolean DEFAULT false NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_eligibility" (
	"user_id" text PRIMARY KEY NOT NULL,
	"date_of_birth" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "message" text;--> statement-breakpoint
ALTER TABLE "trajet" ADD COLUMN "departure_place" text;--> statement-breakpoint
ALTER TABLE "trajet" ADD COLUMN "arrival_place" text;--> statement-breakpoint
ALTER TABLE "trajet" ADD COLUMN "arrival_at" timestamp;--> statement-breakpoint
ALTER TABLE "trajet" ADD COLUMN "amenities" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "trajet" ADD COLUMN "has_intermediate_stop" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_document" ADD CONSTRAINT "driver_document_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_document" ADD CONSTRAINT "driver_document_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_eligibility" ADD CONSTRAINT "driver_eligibility_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "driver_document_owner_idx" ON "driver_document" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "driver_document_status_idx" ON "driver_document" USING btree ("status");