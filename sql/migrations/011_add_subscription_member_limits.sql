-- 011 — subscription member limits (bundles sql/005-member-limit.sql).
-- Idempotent (IF NOT EXISTS + convergent UPDATEs). Auto-applied by the
-- runtime runner on test + prod; fixes "column memberLimitOverride does
-- not exist" 500s on /calendar/archive + /family/create (#050).
ALTER TABLE "subscriptionTypes" ADD COLUMN IF NOT EXISTS "memberLimit" integer DEFAULT 6 NOT NULL;

ALTER TABLE "activeSubscriptions" ADD COLUMN IF NOT EXISTS "memberLimitOverride" integer;

UPDATE "subscriptionTypes" SET "memberLimit" = 999 WHERE "tierName" = 'family_master';

UPDATE "subscriptionTypes" SET "memberLimit" = 6 WHERE "tierName" IN ('free', 'cal_master');
