-- 022 — TaskFocus: focusStartedAt (TaskFocus ticket 079, owner go-ahead 2026-11-01)
-- Idempotent. Additive; existing clients unaffected.

-- focusStartedAt: when the task's current focus began, null when nothing runs.
-- ONE writer (the desktop push). Unlike focus_minutes, an explicit null in a
-- PUT body is a value ("stopped") — routes enforce: field present = overwrite
-- (null included), field absent = unchanged. The phone's live minutes are
-- focus_minutes + (now - focus_started_at).
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "focus_started_at" timestamp with time zone;
