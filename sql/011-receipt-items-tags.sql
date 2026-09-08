-- 011 — receipt line items + tag table (#031; applied via psql to local
-- Docker DBs AND to Neon later — this one is production-bound).
-- Amounts are integer cents, never float. itemTags: one row per
-- (scope, key, category); global rows have user_id NULL (Postgres unique
-- treats NULLs as distinct, hence the partial indexes).
CREATE TABLE IF NOT EXISTS "receiptItems" (
	"id" text PRIMARY KEY NOT NULL,
	"billId" text NOT NULL REFERENCES "bills"("id") ON DELETE cascade,
	"label" text NOT NULL,
	"price_cents" integer NOT NULL,
	-- NULL = inherits the parent bill's category.
	"category" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "receipt_items_bill_idx" ON "receiptItems" ("billId");

CREATE TABLE IF NOT EXISTS "itemTags" (
	"id" text PRIMARY KEY NOT NULL,
	-- NULL = GLOBAL row (learned across all users).
	"userId" text REFERENCES "users"("id") ON DELETE cascade,
	"key" text NOT NULL,
	"category" text NOT NULL,
	-- Learned display name for code-only (store-SKU) items.
	"name" text,
	"weight" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "item_tags_user_key_category_unique"
	ON "itemTags" ("userId", "key", "category") WHERE "userId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "item_tags_global_key_category_unique"
	ON "itemTags" ("key", "category") WHERE "userId" IS NULL;
CREATE INDEX IF NOT EXISTS "item_tags_key_idx" ON "itemTags" ("key");
