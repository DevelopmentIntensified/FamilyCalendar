-- 006 — Family-mirror origin tracking (docs/issues/014, item 4)
--
-- Mirrors created by syncEventsToFamilyCalendar now point back at their
-- master event, so master PUT/DELETE can propagate (title/time/location/
-- description) and delete them instead of leaving frozen/ghost copies.
-- Additive nullable column + index; mirrors created before this migration
-- keep mirror_of NULL (one-time backfill not possible retroactively).
-- The FK cascade is a backstop; the app also deletes mirrors explicitly
-- inside the same transaction.

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "mirror_of" text
	REFERENCES "events"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "events_mirror_of_idx" ON "events" ("mirror_of");
