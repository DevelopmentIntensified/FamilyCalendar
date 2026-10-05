-- 016 — drop the unused userAdConsent table
--
-- WHY
--
-- `userAdConsent` and `adConsentRecords` were two tables answering one question:
-- has this user consented to ad personalisation? Only one of them was ever read.
--
-- `userAdConsent` (created by migration 003) has no writer and no reader anywhere
-- in the codebase — the only mentions are an archived planning document, a
-- historical migration, and comments explaining that it had no writer. It is not
-- declared in `schema.ts`, so the application's own type layer never knew it
-- existed. It was never a second source of truth in practice; it was a
-- leftover shape.
--
-- `adConsentRecords` is the live one, declared at `schema.ts`, and carries a
-- unique key on userId. That is the shape to keep.
--
-- OWNER DECISION, 2026-10-04
--
-- Instructed explicitly: drop it. Irreversible, so the emptiness was verified
-- before this migration was written rather than assumed from the table looking
-- unused.
--
-- VERIFIED EMPTY ON BOTH BRANCHES, 2026-10-04
--
--   branch  br-holy-salad-a50xupa6 (main)          userAdConsent = 0 rows   users = 239
--   branch  br-misty-butterfly-a5mpnuxu (preview)  userAdConsent = 0 rows   users = 103
--
-- Both verified with `SELECT count(*)`. The drop was applied to both branches and
-- absence confirmed with `to_regclass(...) IS NULL` rather than inferred from the
-- DROP succeeding.
--
-- NOTE: `adConsentRecords` is also currently 0 rows on both branches. That is
-- expected rather than alarming — no user has been asked for consent yet, so
-- there is nothing to record. It is called out here so a future reader does not
-- mistake one empty table for a problem.

DROP TABLE IF EXISTS "userAdConsent";

-- Verify. Expect ad_consent_dropped = true, duplicate_present = false.
SELECT
	to_regclass('"userAdConsent"') IS NULL AS ad_consent_dropped,
	to_regclass('"adConsentRecords"') IS NOT NULL AS live_table_present,
	(SELECT count(*) FROM "adConsentRecords") AS live_rows;
