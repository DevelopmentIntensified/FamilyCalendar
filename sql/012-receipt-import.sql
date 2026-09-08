-- 012 - digital receipt import (#033; applied via psql to local Docker DBs
-- AND to Neon later - this one is production-bound). Idempotent: safe to
-- re-run.
--
-- bills.source: provenance + draft marker. 'manual' (default) = a normal
-- user-created bill. 'email' = an ingest draft from the Resend Inbound
-- webhook — NOT yet confirmed by the user, never counted as spent, never
-- trains the Tag Table until the user confirms (which flips it to
-- 'manual'). 'paste'/'scan' are reserved for provenance.
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual' NOT NULL;

-- users.receiptIngestToken: the random local-part token behind each user's
-- personal ingest address (receipts.<token>@<inbound domain>). Nullable —
-- the feature is off until the user's token is generated. Unique so a
-- token can never route to two users.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "receiptIngestToken" text;
CREATE UNIQUE INDEX IF NOT EXISTS "users_receipt_ingest_token_unique"
	ON "users" ("receiptIngestToken") WHERE "receiptIngestToken" IS NOT NULL;

-- ── Neon (production) block ────────────────────────────────────────────
-- Run against Neon with the same credentials/role as the app:
--
--   ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual' NOT NULL;
--   ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "receiptIngestToken" text;
--   CREATE UNIQUE INDEX IF NOT EXISTS "users_receipt_ingest_token_unique"
--     ON "users" ("receiptIngestToken") WHERE "receiptIngestToken" IS NOT NULL;
