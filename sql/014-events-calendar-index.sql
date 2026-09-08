-- 014 — Calendar load perf (issue 043): every calendar/dashboard load
-- filters events per calendar, but only mirrorOf was indexed.
-- Idempotent (safe to re-run). RUN MANUALLY on Neon (pending).
CREATE INDEX IF NOT EXISTS "events_calendar_id_idx" ON "events" ("calendar_id");
CREATE INDEX IF NOT EXISTS "events_calendar_id_start_idx" ON "events" ("calendar_id", "start");
