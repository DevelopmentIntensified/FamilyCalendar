-- 025 — taskfocus_sessions: the phone's own focus-session log (#293, TaskFocus #124).
-- Idempotent. Additive; existing clients unaffected.
-- The phone never writes tasks.focus_minutes. The desktop absorbs CLOSED
-- sessions (absorbed_at), PUTs the new focus_minutes, then acks. ended_at
-- NULL = running; at most one running session per user (partial unique).
-- Rows go with the user and with the task (ON DELETE CASCADE).
CREATE TABLE IF NOT EXISTS "taskfocus_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
	"task_id" text NOT NULL REFERENCES "tasks" ("id") ON DELETE CASCADE,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"source" text DEFAULT 'phone' NOT NULL,
	"absorbed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "taskfocus_sessions_user_absorbed_started_idx"
	ON "taskfocus_sessions" ("user_id", "absorbed_at", "started_at");

CREATE UNIQUE INDEX IF NOT EXISTS "taskfocus_sessions_user_open_unique"
	ON "taskfocus_sessions" ("user_id") WHERE "ended_at" IS NULL;
