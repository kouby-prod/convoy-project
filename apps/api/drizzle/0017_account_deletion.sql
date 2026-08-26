CREATE TABLE "account_deletion" (
	"user_id" text PRIMARY KEY NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purge_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_deletion" ADD CONSTRAINT "account_deletion_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "account_deletion_purge_at_idx" ON "account_deletion" USING btree ("purge_at");
