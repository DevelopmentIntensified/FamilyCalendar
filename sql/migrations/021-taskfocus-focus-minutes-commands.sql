-- 021 — TaskFocus: focus minutes + device command channel (owner triage spec 2026-10-27)
-- Idempotent. Additive; existing clients unaffected.

-- focusMinutes: whole focus minutes accrued by the desktop clock. ONE writer
-- (the desktop push); the phone only reads. Absent/null = no time yet — a PUT
-- that omits the field must NEVER reset it (routes enforce: absent = unchanged).
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "focus_minutes" integer;

-- Device command channel: a phone enqueues start/stop; the desktop consumes
-- FIFO (oldest first) and acks by DELETE (idempotent). task_id is nullable —
-- "stop" may target whatever is running. Auto-drop of stale commands is
-- hygiene done on read (age also checked client-side before acting).
CREATE TABLE IF NOT EXISTS "taskfocus_commands" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
	"command" text NOT NULL, -- 'start' | 'stop'
	"task_id" text REFERENCES "tasks" ("id") ON DELETE CASCADE,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "taskfocus_commands_user_queue_idx"
	ON "taskfocus_commands" ("user_id", "issued_at");
