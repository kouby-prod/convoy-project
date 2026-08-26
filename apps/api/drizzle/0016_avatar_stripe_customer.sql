CREATE TABLE "user_avatar" (
	"user_id" text PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_avatar" ADD CONSTRAINT "user_avatar_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "stripe_customer" (
	"user_id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"default_payment_method_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stripe_customer" ADD CONSTRAINT "stripe_customer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_customer_customer_id_uidx" ON "stripe_customer" USING btree ("customer_id");
