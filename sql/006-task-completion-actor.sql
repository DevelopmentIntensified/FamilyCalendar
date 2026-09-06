-- 006 — taskCompletions.actorId: record the ACTING user on recurring
-- check-offs (the owner row stays for legacy attribution). Dashboard
-- wins/streak queries attribute to the actor when present, falling back
-- to userId for old rows. Idempotent.
ALTER TABLE "taskCompletions" ADD COLUMN IF NOT EXISTS "actorId" text REFERENCES "users"("id") ON DELETE SET NULL;
