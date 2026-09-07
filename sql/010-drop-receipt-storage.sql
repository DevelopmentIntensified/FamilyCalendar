-- 010 - Drop receipt image storage (issue 010 DECISION CHANGE + #029):
-- receipt images are processed on-device and deleted — never uploaded,
-- never stored. Removes the storage side built by the in-flight lane.
-- Idempotent: safe to re-run.
ALTER TABLE "bills" DROP COLUMN IF EXISTS "attachment_id";
DROP TABLE IF EXISTS "attachments";
