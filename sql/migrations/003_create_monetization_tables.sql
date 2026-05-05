-- Create all missing tables for Family Master feature

-- discounts table
CREATE TABLE IF NOT EXISTS "discounts" (
    "id" text PRIMARY KEY NOT NULL,
    "code" text NOT NULL,
    "description" text,
    "percentage" integer NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "appliesToLifetime" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp DEFAULT now() NOT NULL
);

-- userDiscounts table
CREATE TABLE IF NOT EXISTS "userDiscounts" (
    "userId" text NOT NULL,
    "discountId" text NOT NULL,
    "createdAt" timestamp DEFAULT now() NOT NULL,
    PRIMARY KEY("userId", "discountId")
);

-- subscriptionTypes table
CREATE TABLE IF NOT EXISTS "subscriptionTypes" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "monthlyPrice" integer NOT NULL,
    "annualPrice" integer NOT NULL,
    "lifetimePrice" integer NOT NULL,
    "maxFamilies" integer DEFAULT 1 NOT NULL,
    "maxFamilyMembers" integer DEFAULT 2 NOT NULL,
    "monthViewRetention" integer DEFAULT 12 NOT NULL,
    "archivedRetentionMonths" integer DEFAULT 3 NOT NULL,
    "maxAttachmentMB" integer DEFAULT 10 NOT NULL,
    "aiEventCreationsPerMonth" integer DEFAULT 10 NOT NULL,
    "aiUsagePointsPerMonth" integer DEFAULT 100 NOT NULL,
    "exportImportEnabled" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp DEFAULT now() NOT NULL
);

-- activeSubscriptions table
CREATE TABLE IF NOT EXISTS "activeSubscriptions" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL,
    "subscriptionTypeId" text NOT NULL,
    "status" text DEFAULT 'active' NOT NULL,
    "currentPeriodStart" timestamp NOT NULL,
    "currentPeriodEnd" timestamp NOT NULL,
    "cancelAtPeriodEnd" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp DEFAULT now() NOT NULL,
    "updatedAt" timestamp DEFAULT now() NOT NULL
);

-- aiUsageTracking table
CREATE TABLE IF NOT EXISTS "aiUsageTracking" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL,
    "feature" text NOT NULL,
    "pointsUsed" integer DEFAULT 0 NOT NULL,
    "periodStart" timestamp NOT NULL,
    "createdAt" timestamp DEFAULT now() NOT NULL,
    UNIQUE("userId", "periodStart", "feature")
);

-- adEvents table
CREATE TABLE IF NOT EXISTS "adEvents" (
    "id" text PRIMARY KEY NOT NULL,
    "eventId" text NOT NULL,
    "adType" text NOT NULL,
    "shownAt" timestamp DEFAULT now() NOT NULL
);

-- userAdConsent table
CREATE TABLE IF NOT EXISTS "userAdConsent" (
    "userId" text PRIMARY KEY NOT NULL,
    "showAdsAsEvents" boolean DEFAULT true NOT NULL,
    "showAdMarkers" boolean DEFAULT true NOT NULL,
    "personalizedAds" boolean DEFAULT true NOT NULL,
    "updatedAt" timestamp DEFAULT now() NOT NULL
);

-- waitlist table
CREATE TABLE IF NOT EXISTS "waitlist" (
    "email" text PRIMARY KEY NOT NULL,
    "referredBy" text,
    "createdAt" timestamp DEFAULT now() NOT NULL
);

-- Add role to familyMembers (in case it doesn't exist)
ALTER TABLE "familyMembers" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'member';