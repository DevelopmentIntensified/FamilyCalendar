-- 013 — Recurring bills (issue 006): frequency + interval on bills.
-- One row per bill; dueDate doubles as the cursor that mark-paid advances.
-- Both null = one-off. The ALTERs are idempotent (safe to re-run).
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "frequency" text;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "interval" integer;
