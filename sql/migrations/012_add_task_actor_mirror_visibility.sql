-- 012 — task actor + event mirrors + task visibility (bundles sql/006,
-- sql/007-event-mirror-of.sql, and the ALTER half of sql/008).
-- Idempotent. NOTE: sql/008's one-shot UPDATE (existing personal tasks ->
-- private) is deliberately NOT bundled — re-running it would flip personal
-- tasks made public after the migration back to private. Run it once
-- manually where the 019 behavior is wanted.
ALTER TABLE "taskCompletions" ADD COLUMN IF NOT EXISTS "actorId" text REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "mirror_of" text REFERENCES "events"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "events_mirror_of_idx" ON "events" ("mirror_of");

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "visibility" text NOT NULL DEFAULT 'public';
