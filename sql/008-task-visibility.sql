-- 008 — Task scoping (issue 019): tasks.visibility 'public' | 'private'.
-- The ALTER is idempotent (safe to re-run). See the ONE-SHOT block below.
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "visibility" text NOT NULL DEFAULT 'public';

-- ONE-SHOT (user decision, issue 019): existing personal tasks become
-- private. Do NOT re-run — a second run would flip personal tasks that
-- were deliberately made public after the migration back to private.
UPDATE "tasks" SET "visibility" = 'private' WHERE "family_id" IS NULL;
