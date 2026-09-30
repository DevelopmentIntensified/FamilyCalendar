-- ============================================================================
-- Family Planz — hand-run SQL, batch 1
-- Written 2026-09-30. Every statement is idempotent and safe to re-run.
--
-- HOW TO RUN THIS
--   psql "$env:DATABASE_URL" -f sql/HAND-RUN-2026-09-30.sql
-- Run it once per environment: test, then production.
--
-- WHY THIS IS A FILE AND NOT A MIGRATION
--   The migration runner (sql/migrations/*.sql) only replays files already in
--   its list, and 21 of the 39 tables were never in a migration at all — they
--   were created by a tool that pushes straight to the database. Until that is
--   fixed (ticket 086), schema changes have to be applied by hand. Do not add
--   these to sql/migrations/ yet.
--
-- EVERYTHING HERE IS SAFE TO RE-RUN. Statements that drop something are marked
-- DESTRUCTIVE and carry a pre-flight SELECT you should run first and read.
-- ============================================================================


-- ############################################################################
-- STEP 0 — READ FIRST, DROP LATER
-- These four queries change nothing. Run them and read the output before you
-- run anything below. Each one answers a question we cannot answer from the
-- code alone.
-- ############################################################################

-- Q1. Does the ad-consent table hold anything?
--     It was read at serve time but had no writer anywhere in the code, so every
--     row in it was created while the gate could never pass. If this is 0, drop
--     it freely. If it is not 0, those rows are your only record of what was
--     collected — read them before dropping anything.
SELECT count(*) AS ad_consent_rows FROM "userAdConsent";

-- Q2. Are there waitlist duplicates already?
--     The waitlist's duplicate guard called onConflictDoNothing() but email had
--     no unique index, so the guard could never fire. These are the duplicates
--     STEP 2 will collapse.
SELECT lower(btrim(email)) AS email, count(*) AS times_entered
FROM "waitlist"
GROUP BY 1
HAVING count(*) > 1
ORDER BY times_entered DESC;

-- Q3. Is the event_exceptions table already missing its unique index?
--     Two concurrent single-occurrence edits can both miss the select-then-write
--     and insert duplicate rows. Duplicates already present will make the index
--     build in STEP 3 fail, so this is not optional.
SELECT event_id, original_date, count(*) AS copies
FROM "event_exceptions"
GROUP BY 1, 2
HAVING count(*) > 1;

-- Q4. What does the live database actually contain?
--     Ticket 086: 21 tables have no migration, and migration 003 contradicts the
--     schema on 8 tables. We have three disagreeing sources and no ground truth.
--     This is the ground truth. Paste the output back and 086 can be written
--     against reality instead of against a guess.
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;


-- ############################################################################
-- STEP 1 — Ad consent (ticket 088)
-- One field now governs ads: userSettings.showAdsAsEvents, default false.
-- The duplicate table is dead. Read Q1 above first.
-- ############################################################################

DROP TABLE IF EXISTS "userAdConsent";


-- ############################################################################
-- STEP 2 — Waitlist duplicates (ticket 089)
-- Give email a unique constraint so the existing duplicate guard can fire.
-- The dedupe below runs FIRST on purpose: without it the index build fails.
--
-- DESTRUCTIVE in the sense that it collapses rows. It keeps the EARLIEST row of
-- each address, which is the one whose creation timestamp is honest.
-- ############################################################################

-- Keep the earliest row per address; drop the rest.
DELETE FROM "waitlist" w
USING "waitlist" keep
WHERE lower(btrim(w.email)) = lower(btrim(keep.email))
  AND w.id <> keep.id
  AND (w.created_at, w.id) > (keep.created_at, keep.id);

-- The guard in the app calls onConflictDoNothing() with no target, which needs
-- a unique constraint to have anything to conflict with.
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_email_unique"
	ON "waitlist" (lower(btrim(email)));


-- ############################################################################
-- STEP 3 — Event Exception Overrides (ticket 014)
-- upsertException is select-then-write and the table has no unique index, so two
-- concurrent single-occurrence edits insert duplicates. Run Q3 above first; if it
-- returns rows, the dedupe below is what makes the index build possible.
-- ############################################################################

-- DESTRUCTIVE: collapses duplicate exceptions for the same occurrence, keeping
-- the most recently updated one — that is the edit the user actually made last.
DELETE FROM "event_exceptions" a
USING "event_exceptions" b
WHERE a.event_id = b.event_id
  AND a.original_date = b.original_date
  AND (a.updated_at, a.id) < (b.updated_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS "event_exceptions_event_date_unique"
	ON "event_exceptions" (event_id, original_date);


-- ############################################################################
-- STEP 4 — Grocery store colours (ticket 096)
-- A store carries its own colour: per family, with a personal override.
--
-- The two PARTIAL unique indexes are load-bearing, not an optimisation. A
-- personal-scope row has family_id IS NULL, and NULL never compares equal to
-- anything — including another NULL — so without the partial predicate an
-- ON CONFLICT on (user_id, store_key) can never fire, and every colour change by
-- a familyless user would silently duplicate the row. Do not simplify these into
-- one non-partial index.
-- ############################################################################

CREATE TABLE IF NOT EXISTS "grocery_store_colours" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"family_id" text REFERENCES "families"("id") ON DELETE CASCADE,
	"store_key" text NOT NULL,
	"color" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Trim + lowercase: the same normalised key the page groups by, so two
-- spellings of one shop are one group AND one colour.
CREATE UNIQUE INDEX IF NOT EXISTS "grocery_store_colours_family_store_unique"
	ON "grocery_store_colours" (family_id, store_key)
	WHERE family_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "grocery_store_colours_user_store_unique"
	ON "grocery_store_colours" (user_id, store_key)
	WHERE family_id IS NULL;

CREATE INDEX IF NOT EXISTS "grocery_store_colours_store_key_idx"
	ON "grocery_store_colours" (store_key);


-- ############################################################################
-- STEP 5 — Member strip (ticket 103)
-- The Member Strip is off the dashboard. This table holds a row only while a
-- module is switched off, so this touches exactly the families that had it off.
-- Nothing depends on these rows either way.
-- ############################################################################

DELETE FROM "dashboardModuleSwitches" WHERE "module" = 'memberStrip';


-- ############################################################################
-- STEP 6 — Constrain the colour columns (ticket 096, raised by review)
-- Both colour columns are free text, guarded only by the application. A CHECK
-- closes it at the database, so a bad value cannot reach the table even if the
-- app's guard is bypassed.
--
-- Values are the curated earthy palette. If you add a colour to the palette in
-- code, add it here too, or this constraint will reject a legitimate value.
-- ############################################################################

ALTER TABLE "grocery_store_colours"
	DROP CONSTRAINT IF EXISTS "grocery_store_colours_color_check";

ALTER TABLE "grocery_store_colours"
	ADD CONSTRAINT "grocery_store_colours_color_check"
	CHECK (color IN ('#c45e38', '#d38248', '#4d9c85', '#5b9fb5', '#8d7aa8', '#b45309'));

-- Families created before the curated palette arrived may hold any hex, so this
-- one is a format check rather than a value check — narrowing it would reject
-- existing families.
ALTER TABLE "families"
	DROP CONSTRAINT IF EXISTS "families_color_format_check";

ALTER TABLE "families"
	ADD CONSTRAINT "families_color_format_check"
	CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$');


-- ############################################################################
-- STEP 7 — Orphaned grouping tables (ticket 090)
#
-- groups / userGroups / familyGroups are declared, joined to each other and to
-- real tables, and read by NOTHING. No route, no query, no action.
#
-- HOLD ON THIS ONE. It is the only genuinely irreversible step in this file.
-- Two end-to-end specs reference userGroups in their cleanup helpers, and they
-- are not in this repo's default test run, so nothing will tell you they broke.
--
-- ONLY run this if you have decided you never wanted family grouping. If you
# ever did, this is a feature ticket, not a cleanup one, and you should stop here.
--
-- DESTRUCTIVE. Children before parents — the two join tables reference groups.
-- ############################################################################

-- DROP TABLE IF EXISTS "userGroups";
-- DROP TABLE IF EXISTS "familyGroups";
-- DROP TABLE IF EXISTS "groups";


-- ============================================================================
-- VERIFY — run these after, to confirm the batch landed.
-- ============================================================================

SELECT indexname FROM pg_indexes
WHERE indexname IN (
	'waitlist_email_unique',
	'event_exceptions_event_date_unique',
	'grocery_store_colours_family_store_unique',
	'grocery_store_colours_user_store_unique'
) ORDER BY indexname;

SELECT to_regclass('"userAdConsent"') IS NULL AS ad_consent_dropped,
       (SELECT count(*) FROM "dashboardModuleSwitches" WHERE "module" = 'memberStrip')
		AS member_strip_switches_left,
       (SELECT count(*) FROM "waitlist")
		- (SELECT count(DISTINCT lower(btrim(email))) FROM "waitlist")
		AS waitlist_duplicates_left;

-- Should be 0 on every line. Anything else means a dedupe above did not run.
SELECT count(*) AS waitlist_dupes_remaining FROM (
	SELECT 1 FROM "waitlist" GROUP BY lower(btrim(email)) HAVING count(*) > 1
) d;

SELECT count(*) AS exception_dupes_remaining FROM (
	SELECT 1 FROM "event_exceptions" GROUP BY event_id, original_date HAVING count(*) > 1
) d;
