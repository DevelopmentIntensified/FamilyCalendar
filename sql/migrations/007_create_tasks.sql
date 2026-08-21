-- 007: Tasks - completable items, optionally due on a date, optionally attached to an event
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"family_id" text REFERENCES "families"("id") ON DELETE CASCADE,
	"event_id" text REFERENCES "events"("id") ON DELETE CASCADE,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "tasks_user_id_idx" ON "tasks" ("user_id");
CREATE INDEX IF NOT EXISTS "tasks_event_id_idx" ON "tasks" ("event_id");
