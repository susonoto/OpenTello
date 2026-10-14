CREATE TABLE "relay" (
	"id" serial PRIMARY KEY,
	"room" text NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "relay_room_id_idx" ON "relay" ("room","id");--> statement-breakpoint
CREATE INDEX "relay_created_at_idx" ON "relay" ("created_at");