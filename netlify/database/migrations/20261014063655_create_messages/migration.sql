CREATE TABLE "messages" (
	"id" serial PRIMARY KEY,
	"kind" text DEFAULT 'message' NOT NULL,
	"user" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
