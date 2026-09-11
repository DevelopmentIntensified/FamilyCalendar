# 050 — Prod schema drift: memberLimitOverride (+ archive/family 500s)

Status: open

## Done

- Filed from bug exports 2026-09-10 + 2026-09-07: `column "memberLimitOverride" does not exist` on `/calendar/archive` (x2) and `/family/create` (x1). Code selects it via `getUserSubscriptionLimits` (`src/lib/server/services/subscriptionService.ts:125`); column defined in `sql/005-member-limit.sql` + `schema.ts:150`.

## Needs doing

- Root cause: `sql/005`–`sql/014` were applied via psql locally but NEVER bundled — `src/lib/server/db/migrations/scripts.ts` + `sql/migrations/` only carry 001–010 (+0001 password). Runtime `runMigrations` (`src/hooks.server.ts`) therefore never applies them on Neon. Grep confirms zero hits for memberLimitOverride/receiptIngestToken in `sql/migrations/`.
- Fix: bundle missing DDL (005 memberLimit/overrides, 006 task actor, 007 mirror-of, 008 visibility, 009 attachments, 011 items/tags, 012 source/ingest-token, 013 recurring-bills, 014 calendar index) as new `sql/migrations/011_*.sql`+ idempotent files + registry entries; deploy test → verify `__schema_migrations`; then prod deploy applies automatically.
- Immediate relief (user runs manually on Neon NOW): `ALTER TABLE "subscriptionTypes" ADD COLUMN IF NOT EXISTS "memberLimit" integer DEFAULT 6 NOT NULL; ALTER TABLE "activeSubscriptions" ADD COLUMN IF NOT EXISTS "memberLimitOverride" integer;` (full 005 in `sql/005-member-limit.sql`). Record alongside per AGENTS.
- Close the 3 auto-filed reports as fixed-once-migrated. Verify /calendar/archive + /family/create load on prod.
- Per slice: build green, push test immediately.
