-- 015 — grocery lists (057). Idempotent.
CREATE TABLE IF NOT EXISTS "grocery_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
	"family_id" text REFERENCES "families" ("id") ON DELETE CASCADE,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"quantity" integer NOT NULL DEFAULT 1,
	"stores" text[] NOT NULL DEFAULT '{}',
	"checked_at" timestamptz,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "grocery_items_user_idx" ON "grocery_items" ("user_id");
CREATE INDEX IF NOT EXISTS "grocery_items_family_idx" ON "grocery_items" ("family_id");

CREATE TABLE IF NOT EXISTS "grocery_store_memory" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
	"family_id" text REFERENCES "families" ("id") ON DELETE CASCADE,
	"name_key" text NOT NULL,
	"store" text NOT NULL,
	"count" integer NOT NULL DEFAULT 1,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "grocery_store_memory_scope_idx"
	ON "grocery_store_memory" ("family_id", "user_id", "name_key");
