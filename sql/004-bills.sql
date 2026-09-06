-- 004 — bills table (manual record; applied via db:push).
-- Amounts are integer cents, never float.
CREATE TABLE IF NOT EXISTS "bills" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"due_date" timestamp with time zone,
	"category" text DEFAULT 'other' NOT NULL,
	"paid_at" timestamp with time zone,
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"family_id" text REFERENCES "families"("id") ON DELETE cascade,
	"created_at" timestamp DEFAULT now() NOT NULL
);
