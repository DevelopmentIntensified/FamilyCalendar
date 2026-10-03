-- 086: grocery_store_colours — the table #096's code has been reading and
-- writing since it shipped, and which has never existed.
--
-- Declared at src/lib/server/db/schema.ts:973. Verified missing on BOTH
-- branches of hidden-resonance-16080139 (main and preview/test) with
-- to_regclass('public.grocery_store_colours') IS NULL, 2026-10-03.
--
-- Consequence: store colours render their name-hashed default, so the feature
-- looks alive. The moment a person picks one, groceries.ts:279/288 INSERTs and
-- throws. The default path and the failure path look identical from the UI.
--
-- HAND-RUN THIS. Nothing applies it automatically.
--
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS "grocery_store_colours" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"family_id" text,
	"store_key" text NOT NULL,
	"color" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "grocery_store_colours_user_id_users_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
		ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "grocery_store_colours_family_id_families_id_fk"
		FOREIGN KEY ("family_id") REFERENCES "public"."families"("id")
		ON DELETE cascade ON UPDATE no action
);

-- One colour per store per scope, so flipping scope is a single-statement
-- upsert rather than a delete-then-insert. Two partial indexes rather than one
-- composite, because NULL family_id would otherwise collide across every
-- personal store in Postgres' unique semantics.
CREATE UNIQUE INDEX IF NOT EXISTS "grocery_store_colours_family_store_unique"
	ON "grocery_store_colours" ("family_id", "store_key")
	WHERE family_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "grocery_store_colours_user_store_unique"
	ON "grocery_store_colours" ("user_id", "store_key")
	WHERE family_id IS NULL;

CREATE INDEX IF NOT EXISTS "grocery_store_colours_store_key_idx"
	ON "grocery_store_colours" ("store_key");

-- ---------------------------------------------------------------------------
-- Verify (expect one row, and 0 not-null-until it is run):
--
--   SELECT to_regclass('public.grocery_store_colours');
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'grocery_store_colours' ORDER BY indexname;
--
-- Run on BOTH main and preview/test — they are independent copies, not
-- replicas. A table created on one does not appear on the other.
-- ---------------------------------------------------------------------------
