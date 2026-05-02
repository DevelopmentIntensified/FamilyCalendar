CREATE TABLE "adEvents" (
	"id" text PRIMARY KEY NOT NULL,
	"sponsorName" text NOT NULL,
	"message" text NOT NULL,
	"ctaText" text,
	"ctaLink" text,
	"targetPlan" text,
	"deadline" timestamp,
	"scheduledFor" timestamp NOT NULL,
	"expiresAt" timestamp,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aiUsageTracking" (
	"userId" text NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"aiEventCreationsUsed" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "aiUsageTracking_userId_month_year_pk" PRIMARY KEY("userId","month","year")
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"eligibleRole" text,
	"minFamilyMembers" integer,
	"discountRate" integer NOT NULL,
	"durationMonths" integer,
	"appliesToMonthly" boolean DEFAULT false NOT NULL,
	"appliesToAnnual" boolean DEFAULT false NOT NULL,
	"appliesToLifetime" boolean DEFAULT false NOT NULL,
	"stackable" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "userAdConsent" (
	"userId" text NOT NULL,
	"showAdsAsEvents" boolean DEFAULT true,
	"showAdMarkers" boolean DEFAULT true,
	"personalizedAds" boolean DEFAULT true,
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "userAdConsent_userId_pk" PRIMARY KEY("userId")
);
--> statement-breakpoint
CREATE TABLE "userDiscounts" (
	"userId" text NOT NULL,
	"discountId" text NOT NULL,
	"appliedAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp,
	CONSTRAINT "userDiscounts_userId_discountId_pk" PRIMARY KEY("userId","discountId")
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"firstName" text,
	"lastName" text,
	"region" text,
	"consentedAt" timestamp,
	"preferences" jsonb,
	"optedInAt" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eventAttendance" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "end" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "eventAttendance" ADD CONSTRAINT "eventAttendance_event_id_user_id_pk" PRIMARY KEY("event_id","user_id");--> statement-breakpoint
ALTER TABLE "eventAttendance" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "familyMembers" ADD COLUMN "role" text DEFAULT 'member';--> statement-breakpoint
ALTER TABLE "subscriptionTypes" ADD COLUMN "tierName" text NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptionTypes" ADD COLUMN "planType" text DEFAULT 'individual' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptionTypes" ADD COLUMN "displayName" text NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptionTypes" ADD COLUMN "familyLimit" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptionTypes" ADD COLUMN "retentionViewDays" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptionTypes" ADD COLUMN "archivedRetentionDays" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptionTypes" ADD COLUMN "attachmentLimitBytes" integer DEFAULT 10485760 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptionTypes" ADD COLUMN "aiEventCreationsPerMonth" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptionTypes" ADD COLUMN "exportImportEnabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "activeSubscriptions" ADD COLUMN "familyLimitOverride" integer;--> statement-breakpoint
ALTER TABLE "activeSubscriptions" ADD COLUMN "retentionViewDaysOverride" integer;--> statement-breakpoint
ALTER TABLE "activeSubscriptions" ADD COLUMN "archivedRetentionDaysOverride" integer;--> statement-breakpoint
ALTER TABLE "activeSubscriptions" ADD COLUMN "attachmentLimitBytesOverride" integer;--> statement-breakpoint
ALTER TABLE "userSettings" ADD COLUMN "showAdsAsEvents" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "userSettings" ADD COLUMN "showAdMarkers" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "userSettings" ADD COLUMN "personalizedAds" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "userSettings" ADD COLUMN "autoParseEventDetails" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "userSettings" ADD COLUMN "useCloudAI" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "userSettings" ADD COLUMN "useLocalAI" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "aiUsageTracking" ADD CONSTRAINT "aiUsageTracking_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userAdConsent" ADD CONSTRAINT "userAdConsent_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userDiscounts" ADD CONSTRAINT "userDiscounts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userDiscounts" ADD CONSTRAINT "userDiscounts_discountId_discounts_id_fk" FOREIGN KEY ("discountId") REFERENCES "public"."discounts"("id") ON DELETE cascade ON UPDATE no action;