-- 014 — calendar load perf index (bundles sql/014-events-calendar-index.sql).
-- Idempotent.
CREATE INDEX IF NOT EXISTS "events_calendar_id_idx" ON "events" ("calendar_id");

CREATE INDEX IF NOT EXISTS "events_calendar_id_start_idx" ON "events" ("calendar_id", "start");
