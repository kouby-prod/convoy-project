CREATE TABLE "trajet" (
  "id" text PRIMARY KEY NOT NULL,
  "driver_id" text NOT NULL,
  "departure_city" text NOT NULL,
  "arrival_city" text NOT NULL,
  "departure_at" timestamp NOT NULL,
  "seats_total" integer NOT NULL,
  "seats_available" integer NOT NULL,
  "price_per_seat" numeric NOT NULL,
  "description" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking" (
  "id" text PRIMARY KEY NOT NULL,
  "trajet_id" text NOT NULL,
  "passenger_id" text NOT NULL,
  "seats" integer NOT NULL,
  "status" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trajet" ADD CONSTRAINT "trajet_driver_user_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_trajet_id_fk" FOREIGN KEY ("trajet_id") REFERENCES "public"."trajet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_passenger_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_trajet_idx" ON "booking" USING btree ("trajet_id");--> statement-breakpoint
CREATE INDEX "booking_passenger_idx" ON "booking" USING btree ("passenger_id");--> statement-breakpoint