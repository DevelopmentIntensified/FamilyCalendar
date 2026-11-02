-- 024 — Task categories synced with TaskFocus (#280).
-- Idempotent. Additive; existing clients unaffected (new nullable column,
-- new table). TaskFocus keeps the rule-sets desktop-side; FamilyPlanz carries
-- the NAMES: one per task (tasks.category) plus a per-user list.
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "category" text;

CREATE TABLE IF NOT EXISTS "task_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- One name per user, case-insensitive ("Work" == "work").
CREATE UNIQUE INDEX IF NOT EXISTS "task_categories_user_name_unique"
	ON "task_categories" ("user_id", lower("name"));
