CREATE TABLE "driver_eligibility" (
	"user_id" text PRIMARY KEY NOT NULL,
	"date_of_birth" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "driver_document" ADD COLUMN "age_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_eligibility" ADD CONSTRAINT "driver_eligibility_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;