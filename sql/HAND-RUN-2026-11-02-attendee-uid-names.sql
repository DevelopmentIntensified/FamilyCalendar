-- #274 data repair — HAND-RUN, not a migration. Run once per env (preview, then prod):
--   npx dotenv -e .env.preview -- node scripts/db-exec.mjs sql/HAND-RUN-2026-11-02-attendee-uid-names.sql
--   npx dotenv -e .env.prod    -- node scripts/db-exec.mjs sql/HAND-RUN-2026-11-02-attendee-uid-names.sql
-- Before the #274 fix, editing an event saved family-member invitees as GUESTS
-- whose name was the member's user id (user_id NULL, name = users.id).
-- Idempotent: a second run finds nothing to change.

BEGIN;

-- Preview what will change (read-only).
SELECT a.id, a.event_id, a.name AS uid_as_name, u."firstName", u."lastName"
FROM "eventAttendance" a
JOIN "users" u ON u.id = a.name
WHERE a.user_id IS NULL;

-- 1) The member already has a proper row on that event: the bogus guest row is a duplicate — drop it.
DELETE FROM "eventAttendance" a
USING "users" u
WHERE a.user_id IS NULL
  AND u.id = a.name
  AND EXISTS (
    SELECT 1 FROM "eventAttendance" b
    WHERE b.event_id = a.event_id AND b.user_id = a.name
  );

-- 1b) Two bogus rows for the same member on one event: keep one.
DELETE FROM "eventAttendance" a
USING "eventAttendance" b, "users" u
WHERE a.user_id IS NULL AND b.user_id IS NULL
  AND u.id = a.name
  AND a.event_id = b.event_id AND a.name = b.name
  AND a.id > b.id;

-- 2) Otherwise turn the guest row back into a member invite (keeps status + invite_type).
UPDATE "eventAttendance" a
SET user_id = a.name, name = NULL
FROM "users" u
WHERE a.user_id IS NULL
  AND u.id = a.name;

COMMIT;
