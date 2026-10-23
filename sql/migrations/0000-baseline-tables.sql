-- 0000 - Baseline tables (#086, generated from schema.ts via drizzle-kit, hand-adapted:
-- guarded creates/indexes, familyInviteCodes FKs deferred to 010, constraint/index adds
-- idempotent so live DBs (whose shapes already match) re-run this as a no-op. Fresh
-- databases get the full schema shape before 001 touches them.
CREATE TABLE IF NOT EXISTS "accounts" (
	"userId" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adConsentRecords" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"decision" text NOT NULL,
	"recordedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adEvents" (
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
CREATE TABLE IF NOT EXISTS "aiUsageTracking" (
	"userId" text NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"aiEventCreationsUsed" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "aiUsageTracking_userId_month_year_pk" PRIMARY KEY("userId","month","year")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"providerId" text NOT NULL,
	"accountId" text NOT NULL,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"userId" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bills" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"due_date" timestamp with time zone,
	"category" text DEFAULT 'other' NOT NULL,
	"paid_at" timestamp with time zone,
	"frequency" text,
	"interval" integer,
	"source" text DEFAULT 'manual' NOT NULL,
	"user_id" text NOT NULL,
	"family_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bugReports" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text,
	"area" text NOT NULL,
	"description" text NOT NULL,
	"url" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolvedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendars" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text,
	"family_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "childConsentRecords" (
	"id" text PRIMARY KEY NOT NULL,
	"childUserId" text NOT NULL,
	"parentUserId" text NOT NULL,
	"familyId" text NOT NULL,
	"source" text NOT NULL,
	"recordedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "claim_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "claim_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "codes" (
	"code" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"email" text NOT NULL,
	"firstName" text,
	"lastName" text,
	"emailId" text,
	"type" text DEFAULT 'signup',
	"pendingEmail" text,
	CONSTRAINT "codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dashboardModuleSwitches" (
	"id" text PRIMARY KEY NOT NULL,
	"familyId" text NOT NULL,
	"module" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dashboardModuleSwitches_family_module_unique" UNIQUE("familyId","module")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discounts" (
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
CREATE TABLE IF NOT EXISTS "eventAttendance" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text,
	"name" text,
	"status" text DEFAULT 'undecided',
	"invite_type" text DEFAULT 'optional'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_exceptions" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"original_date" timestamp with time zone NOT NULL,
	"is_cancelled" boolean DEFAULT false NOT NULL,
	"title" text,
	"description" text,
	"location" text,
	"start" timestamp with time zone,
	"end" timestamp with time zone,
	"all_day" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
	"id" text PRIMARY KEY NOT NULL,
	"calendar_id" text,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"start" timestamp with time zone NOT NULL,
	"end" timestamp with time zone,
	"description" text,
	"location" text,
	"all_day" boolean DEFAULT false NOT NULL,
	"recurrence_frequency" text,
	"recurrence_interval" integer,
	"recurrence_by_day" text[],
	"recurrence_count" integer,
	"recurrence_until" timestamp with time zone,
	"reminder_minutes" integer,
	"mirror_of" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "families" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "familyInviteCodes" (
	"code" text PRIMARY KEY NOT NULL,
	"familyId" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"maxUses" integer DEFAULT 1,
	"useCount" integer DEFAULT 0,
	"createdBy" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "familyMembers" (
	"user_id" text NOT NULL,
	"family_id" text NOT NULL,
	"role" text DEFAULT 'member',
	"memberType" text DEFAULT 'member',
	CONSTRAINT "familyMembers_user_id_family_id_pk" PRIMARY KEY("user_id","family_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grocery_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"family_id" text,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"stores" text[] DEFAULT '{}' NOT NULL,
	"checked_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grocery_store_colours" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"family_id" text,
	"store_key" text NOT NULL,
	"color" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grocery_store_memory" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"family_id" text,
	"name_key" text NOT NULL,
	"store" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "itemTags" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text,
	"key" text NOT NULL,
	"category" text NOT NULL,
	"name" text,
	"weight" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meals" (
	"id" text PRIMARY KEY NOT NULL,
	"familyId" text NOT NULL,
	"date" text NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"createdBy" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"actorName" text NOT NULL,
	"message" text NOT NULL,
	"link" text,
	"readAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pushSubscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "receiptItems" (
	"id" text PRIMARY KEY NOT NULL,
	"billId" text NOT NULL,
	"label" text NOT NULL,
	"price_cents" integer NOT NULL,
	"category" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptionTypes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tierName" text NOT NULL,
	"planType" text DEFAULT 'individual' NOT NULL,
	"displayName" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"durationMonths" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"familyLimit" integer DEFAULT 1 NOT NULL,
	"memberLimit" integer DEFAULT 6 NOT NULL,
	"retentionViewDays" integer DEFAULT 30 NOT NULL,
	"archivedRetentionDays" integer DEFAULT 90 NOT NULL,
	"attachmentLimitBytes" integer DEFAULT 10485760 NOT NULL,
	"aiEventCreationsPerMonth" integer DEFAULT 10 NOT NULL,
	"exportImportEnabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activeSubscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"startDate" timestamp NOT NULL,
	"notificationMethods" jsonb NOT NULL,
	"subscriptionTypeId" text,
	"endDate" timestamp NOT NULL,
	"familyLimitOverride" integer,
	"memberLimitOverride" integer,
	"retentionViewDaysOverride" integer,
	"archivedRetentionDaysOverride" integer,
	"attachmentLimitBytesOverride" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "taskCompletions" (
	"id" text PRIMARY KEY NOT NULL,
	"taskId" text NOT NULL,
	"userId" text NOT NULL,
	"actorId" text,
	"familyId" text,
	"completedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "taskTags" (
	"taskId" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "taskTags_taskId_name_pk" PRIMARY KEY("taskId","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"recurrence_frequency" text,
	"recurrence_interval" integer,
	"completion_count" integer DEFAULT 0 NOT NULL,
	"assigned_to" text,
	"assignment_status" text DEFAULT 'none',
	"priority" text DEFAULT 'normal' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"user_id" text NOT NULL,
	"family_id" text,
	"event_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "unmatchedPhrases" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"phrase" text NOT NULL,
	"sample" text NOT NULL,
	"matched" text,
	"count" integer DEFAULT 1 NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "userDiscounts" (
	"userId" text NOT NULL,
	"discountId" text NOT NULL,
	"appliedAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp,
	CONSTRAINT "userDiscounts_userId_discountId_pk" PRIMARY KEY("userId","discountId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "userSettings" (
	"id" text PRIMARY KEY NOT NULL,
	"weekStart" text DEFAULT 'sunday',
	"timeZone" text,
	"color" text,
	"syncEventsToFamilyCalendar" boolean,
	"showAdsAsEvents" boolean DEFAULT false,
	"autoParseEventDetails" boolean DEFAULT true,
	"useCloudAI" boolean DEFAULT true,
	"useLocalAI" boolean DEFAULT true,
	"showDailyVerse" boolean DEFAULT false,
	"verseTranslation" text DEFAULT 'esv',
	"hiddenDashboardModules" text[],
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"defaultCalendarId" text,
	"defaultView" text DEFAULT 'dayView',
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"firstName" text NOT NULL,
	"lastName" text NOT NULL,
	"email" text,
	"passwordhash" text,
	"emailVerified" boolean,
	"picture" text,
	"roles" json DEFAULT '[]'::json NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"lastActiveAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"phonenumber" text,
	"phonenumberVerified" boolean,
	"lastLogin" timestamp DEFAULT now() NOT NULL,
	"receiptIngestToken" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "waitlist" (
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
DO $$ BEGIN ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "adConsentRecords" ADD CONSTRAINT "adConsentRecords_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "aiUsageTracking" ADD CONSTRAINT "aiUsageTracking_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "bills" ADD CONSTRAINT "bills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "bills" ADD CONSTRAINT "bills_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "bugReports" ADD CONSTRAINT "bugReports_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "calendars" ADD CONSTRAINT "calendars_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "calendars" ADD CONSTRAINT "calendars_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "childConsentRecords" ADD CONSTRAINT "childConsentRecords_childUserId_users_id_fk" FOREIGN KEY ("childUserId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "childConsentRecords" ADD CONSTRAINT "childConsentRecords_parentUserId_users_id_fk" FOREIGN KEY ("parentUserId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "claim_tokens" ADD CONSTRAINT "claim_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "dashboardModuleSwitches" ADD CONSTRAINT "dashboardModuleSwitches_familyId_families_id_fk" FOREIGN KEY ("familyId") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "eventAttendance" ADD CONSTRAINT "eventAttendance_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "eventAttendance" ADD CONSTRAINT "eventAttendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "event_exceptions" ADD CONSTRAINT "event_exceptions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "events" ADD CONSTRAINT "events_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "events" ADD CONSTRAINT "events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "events" ADD CONSTRAINT "events_mirror_of_events_id_fk" FOREIGN KEY ("mirror_of") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "familyMembers" ADD CONSTRAINT "familyMembers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "familyMembers" ADD CONSTRAINT "familyMembers_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "grocery_items" ADD CONSTRAINT "grocery_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "grocery_items" ADD CONSTRAINT "grocery_items_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "grocery_store_colours" ADD CONSTRAINT "grocery_store_colours_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "grocery_store_colours" ADD CONSTRAINT "grocery_store_colours_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "grocery_store_memory" ADD CONSTRAINT "grocery_store_memory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "grocery_store_memory" ADD CONSTRAINT "grocery_store_memory_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "itemTags" ADD CONSTRAINT "itemTags_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "meals" ADD CONSTRAINT "meals_familyId_families_id_fk" FOREIGN KEY ("familyId") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "meals" ADD CONSTRAINT "meals_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pushSubscriptions" ADD CONSTRAINT "pushSubscriptions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "receiptItems" ADD CONSTRAINT "receiptItems_billId_bills_id_fk" FOREIGN KEY ("billId") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "activeSubscriptions" ADD CONSTRAINT "activeSubscriptions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "activeSubscriptions" ADD CONSTRAINT "activeSubscriptions_subscriptionTypeId_subscriptionTypes_id_fk" FOREIGN KEY ("subscriptionTypeId") REFERENCES "public"."subscriptionTypes"("id") ON DELETE restrict ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "taskCompletions" ADD CONSTRAINT "taskCompletions_taskId_tasks_id_fk" FOREIGN KEY ("taskId") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "taskCompletions" ADD CONSTRAINT "taskCompletions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "taskCompletions" ADD CONSTRAINT "taskCompletions_actorId_users_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "taskCompletions" ADD CONSTRAINT "taskCompletions_familyId_families_id_fk" FOREIGN KEY ("familyId") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "taskTags" ADD CONSTRAINT "taskTags_taskId_tasks_id_fk" FOREIGN KEY ("taskId") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tasks" ADD CONSTRAINT "tasks_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tasks" ADD CONSTRAINT "tasks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "userDiscounts" ADD CONSTRAINT "userDiscounts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "userDiscounts" ADD CONSTRAINT "userDiscounts_discountId_discounts_id_fk" FOREIGN KEY ("discountId") REFERENCES "public"."discounts"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "userSettings" ADD CONSTRAINT "userSettings_defaultCalendarId_calendars_id_fk" FOREIGN KEY ("defaultCalendarId") REFERENCES "public"."calendars"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
DO $$ BEGIN ALTER TABLE "userSettings" ADD CONSTRAINT "userSettings_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$; --> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ad_consent_records_user_recorded_idx" ON "adConsentRecords" USING btree ("userId","recordedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bug_reports_status_created_idx" ON "bugReports" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "child_consent_records_child_recorded_idx" ON "childConsentRecords" USING btree ("childUserId","recordedAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_attendance_user_unique" ON "eventAttendance" USING btree ("event_id","user_id") WHERE user_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_attendance_name_unique" ON "eventAttendance" USING btree ("event_id","name") WHERE name IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_mirror_of_idx" ON "events" USING btree ("mirror_of");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_calendar_id_idx" ON "events" USING btree ("calendar_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_calendar_id_start_idx" ON "events" USING btree ("calendar_id","start");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "grocery_store_colours_family_store_unique" ON "grocery_store_colours" USING btree ("family_id","store_key") WHERE family_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "grocery_store_colours_user_store_unique" ON "grocery_store_colours" USING btree ("user_id","store_key") WHERE family_id IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grocery_store_colours_store_key_idx" ON "grocery_store_colours" USING btree ("store_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "item_tags_user_key_category_unique" ON "itemTags" USING btree ("userId","key","category") WHERE "userId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "item_tags_global_key_category_unique" ON "itemTags" USING btree ("key","category") WHERE "userId" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_tags_key_idx" ON "itemTags" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_idx" ON "pushSubscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "receipt_items_bill_idx" ON "receiptItems" USING btree ("billId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unmatched_phrases_source_phrase_idx" ON "unmatchedPhrases" USING btree ("source","phrase");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_email_key" ON "waitlist" USING btree ("email");
