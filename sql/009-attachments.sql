-- 009 - Bill receipts (issue 010): attachments table + bills.attachment_id.
-- Idempotent: safe to re-run.
CREATE TABLE IF NOT EXISTS "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"family_id" text REFERENCES "families"("id") ON DELETE CASCADE,
	"url" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "attachment_id" text REFERENCES "attachments"("id") ON DELETE SET NULL;
