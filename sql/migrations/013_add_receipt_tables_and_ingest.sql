-- 013 — receipt tables + ingest provenance (bundles sql/010-drop-receipt-
-- storage.sql, sql/011-receipt-items-tags.sql, sql/012-receipt-import.sql).
-- Idempotent. Fixes "column users.receiptIngestToken does not exist" 500s
-- (#051). NOTE: needs the bills/users tables (created via db:push, present
-- on test + prod); on a bare fresh DB apply push first.
ALTER TABLE "bills" DROP COLUMN IF EXISTS "attachment_id";

DROP TABLE IF EXISTS "attachments";

CREATE TABLE IF NOT EXISTS "receiptItems" ("id" text PRIMARY KEY NOT NULL, "billId" text NOT NULL REFERENCES "bills"("id") ON DELETE cascade, "label" text NOT NULL, "price_cents" integer NOT NULL, "category" text, "position" integer DEFAULT 0 NOT NULL, "created_at" timestamp DEFAULT now() NOT NULL);

CREATE INDEX IF NOT EXISTS "receipt_items_bill_idx" ON "receiptItems" ("billId");

CREATE TABLE IF NOT EXISTS "itemTags" ("id" text PRIMARY KEY NOT NULL, "userId" text REFERENCES "users"("id") ON DELETE cascade, "key" text NOT NULL, "category" text NOT NULL, "name" text, "weight" integer DEFAULT 0 NOT NULL, "updated_at" timestamp DEFAULT now() NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS "item_tags_user_key_category_unique" ON "itemTags" ("userId", "key", "category") WHERE "userId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "item_tags_global_key_category_unique" ON "itemTags" ("key", "category") WHERE "userId" IS NULL;

CREATE INDEX IF NOT EXISTS "item_tags_key_idx" ON "itemTags" ("key");

ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual' NOT NULL;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "receiptIngestToken" text;

CREATE UNIQUE INDEX IF NOT EXISTS "users_receipt_ingest_token_unique" ON "users" ("receiptIngestToken") WHERE "receiptIngestToken" IS NOT NULL;

ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "frequency" text;

ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "interval" integer;
