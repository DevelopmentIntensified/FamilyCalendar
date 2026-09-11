# 051 — Prod schema drift: users.receiptIngestToken (8× 500s)

Status: done

## Done

- Filed from bug export 2026-09-10 22:52: 8× `column users.receiptIngestToken does not exist` across /favicon.ico, /@vite/client, /calendar, /calendar/tasks, /api/notifications (x4), 2026-09-07 22:56–23:28. Same drift family as #050.

## Needs doing

- Column defined in `sql/012-receipt-import.sql` + `schema.ts:44`, never bundled (see #050). Any load touching users table 500s on prod.
- Immediate relief (Neon NOW): `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "receiptIngestToken" text; CREATE UNIQUE INDEX IF NOT EXISTS "users_receipt_ingest_token_unique" ON "users" ("receiptIngestToken") WHERE "receiptIngestToken" IS NOT NULL;` plus `ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual' NOT NULL;` (same file). Lands automatically once #050 bundling ships; manual step unblocks prod today.
- Close the 8 auto-filed reports once migrated. Note: areaForPath mislabels /favicon.ico + /@vite/client + /api/notifications as "other" — fine, no change needed unless triage wants it.
- Per slice: build green, push test immediately.
