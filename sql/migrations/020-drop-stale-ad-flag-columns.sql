-- 020 - Drop the two orphaned ad-preference columns (#086 step 3 tail).
-- #088 collapsed three ad booleans to one source of truth
-- (userSettings.showAdsAsEvents); showAdMarkers and personalizedAds are read
-- by nothing (single-source gate ignores them) but still live on both Neon
-- branches. Schema no longer declares them. Dropping is the reconcile.
-- Idempotent via existence check; no index/constraint touches these columns.

DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'userSettings'
			AND column_name = 'showAdMarkers'
	) THEN
		ALTER TABLE "userSettings" DROP COLUMN "showAdMarkers";
	END IF;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'userSettings'
			AND column_name = 'personalizedAds'
	) THEN
		ALTER TABLE "userSettings" DROP COLUMN "personalizedAds";
	END IF;
END $$;
