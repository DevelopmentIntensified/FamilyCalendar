-- 005 — memberLimit: max members IN one family, decided by the family
-- creator's tier. `familyLimit` keeps its original meaning (families a user
-- may create). Idempotent.
ALTER TABLE "subscriptionTypes" ADD COLUMN IF NOT EXISTS "memberLimit" integer DEFAULT 6 NOT NULL;
ALTER TABLE "activeSubscriptions" ADD COLUMN IF NOT EXISTS "memberLimitOverride" integer;
-- Seed tiers were inserted with onConflictDoNothing; align existing rows.
UPDATE "subscriptionTypes" SET "memberLimit" = 999 WHERE "tierName" = 'family_master';
UPDATE "subscriptionTypes" SET "memberLimit" = 6 WHERE "tierName" IN ('free', 'cal_master');
