-- Run this SQL to add missing columns to userSettings
ALTER TABLE "userSettings" ADD COLUMN IF NOT EXISTS "showAdsAsEvents" BOOLEAN DEFAULT true;
ALTER TABLE "userSettings" ADD COLUMN IF NOT EXISTS "showAdMarkers" BOOLEAN DEFAULT true;
ALTER TABLE "userSettings" ADD COLUMN IF NOT EXISTS "personalizedAds" BOOLEAN DEFAULT true;

-- Run seed: npx tsx src/lib/server/seed.ts