-- 089: the waitlist duplicate guard never fired — the insert declared
-- onConflictDoNothing with no unique index to conflict on, so every
-- resubmission stored another row for the same address.
--
-- Declared at src/lib/server/db/schema.ts (waitlist_email_key unique index on
-- "email"). The application always lowercases emails before insert and the
-- insert now targets that index explicitly, so the index must be unique per
-- lowercased address — which is why old rows are deduped and normalized first.
--
-- HAND-RUN THIS on BOTH main and preview/test branches (independent copies).
-- Nothing applies it automatically. NOT idempotent in one sense: the DELETE
-- is idempotent, the CREATE INDEX is not required to be (IF NOT EXISTS makes
-- it so).
--
-- Tolerant of both historical table shapes for 086: the dedupe keys rows by
-- ctid (physical placement — insert order), so it works whether the table
-- has the id primary key or the old email-as-primary-key shape.

-- 1. Dedupe: keep the earliest row per lowercased address.
DELETE FROM waitlist a
USING waitlist b
WHERE lower(a.email) = lower(b.email)
	AND a.ctid > b.ctid;

-- 2. Normalize case so the application's lowercase inserts cannot ever split
-- around a unique index on the raw column.
UPDATE waitlist SET email = lower(email) WHERE email <> lower(email);

-- 3. The index the drizzle schema (src/lib/server/db/schema.ts) declares and
-- the onConflictDoNothing target points at. The waitlist table is small, so a
-- plain build is fine; if you prefer CONCURRENTLY, run just this statement
-- outside a transaction.
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_email_key" ON "waitlist" ("email");

-- ---------------------------------------------------------------------------
-- Verify (expect 0 for both queries):
--
--   SELECT count(*) AS duplicate_addresses FROM (
--     SELECT lower(email) FROM waitlist GROUP BY lower(email) HAVING count(*) > 1
--   ) d;
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'waitlist' AND indexname = 'waitlist_email_key';
--
-- ---------------------------------------------------------------------------
