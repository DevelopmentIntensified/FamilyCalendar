-- 005: Recurring events (frequency + interval) and exception overrides
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "recurrence_frequency" TEXT;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "recurrence_interval" INTEGER;

CREATE TABLE IF NOT EXISTS "event_exceptions" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
	"original_date" timestamp with time zone NOT NULL,
	"is_cancelled" boolean DEFAULT false NOT NULL,
	"title" text,
	"description" text,
	"location" text,
	"start" timestamp with time zone,
	"end" timestamp with time zone,
	"all_day" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL
);
