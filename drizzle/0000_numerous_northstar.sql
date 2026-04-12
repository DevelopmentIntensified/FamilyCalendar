CREATE TABLE "accounts" (
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
CREATE TABLE "calendars" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text,
	"family_id" text,
	"name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "codes" (
	"code" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"email" text NOT NULL,
	"firstName" text,
	"lastName" text,
	"emailId" text,
	CONSTRAINT "codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "eventAttendance" (
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'undecided'
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"calendar_id" text,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"start" timestamp with time zone NOT NULL,
	"end" timestamp with time zone NOT NULL,
	"description" text,
	"location" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "families" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "familyGroups" (
	"group_id" text NOT NULL,
	"family_id" text NOT NULL,
	CONSTRAINT "familyGroups_group_id_family_id_pk" PRIMARY KEY("group_id","family_id")
);
--> statement-breakpoint
CREATE TABLE "familyInviteCodes" (
	"code" text PRIMARY KEY NOT NULL,
	"familyId" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"maxUses" integer DEFAULT 1,
	"useCount" integer DEFAULT 0,
	"createdBy" text
);
--> statement-breakpoint
CREATE TABLE "familyMembers" (
	"user_id" text NOT NULL,
	"family_id" text NOT NULL,
	CONSTRAINT "familyMembers_user_id_family_id_pk" PRIMARY KEY("user_id","family_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptionTypes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"durationMonths" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activeSubscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"startDate" timestamp NOT NULL,
	"notificationMethods" jsonb NOT NULL,
	"subscriptionTypeId" text,
	"endDate" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "userGroups" (
	"user_id" text NOT NULL,
	"group_id" text NOT NULL,
	CONSTRAINT "userGroups_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "userSettings" (
	"id" text PRIMARY KEY NOT NULL,
	"weekStart" text DEFAULT 'sunday',
	"timeZone" text,
	"color" text,
	"syncEventsToFamilyCalendar" boolean,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"defaultCalendarId" text,
	"defaultView" text DEFAULT 'dayView',
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"firstName" text NOT NULL,
	"lastName" text NOT NULL,
	"email" text NOT NULL,
	"passwordHash" text,
	"emailVerified" boolean,
	"picture" text,
	"roles" json DEFAULT '[]'::json NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"phonenumber" text,
	"phonenumberVerified" boolean,
	"lastLogin" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventAttendance" ADD CONSTRAINT "eventAttendance_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventAttendance" ADD CONSTRAINT "eventAttendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "familyGroups" ADD CONSTRAINT "familyGroups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "familyGroups" ADD CONSTRAINT "familyGroups_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "familyInviteCodes" ADD CONSTRAINT "familyInviteCodes_familyId_families_id_fk" FOREIGN KEY ("familyId") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "familyInviteCodes" ADD CONSTRAINT "familyInviteCodes_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "familyMembers" ADD CONSTRAINT "familyMembers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "familyMembers" ADD CONSTRAINT "familyMembers_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activeSubscriptions" ADD CONSTRAINT "activeSubscriptions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activeSubscriptions" ADD CONSTRAINT "activeSubscriptions_subscriptionTypeId_subscriptionTypes_id_fk" FOREIGN KEY ("subscriptionTypeId") REFERENCES "public"."subscriptionTypes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userGroups" ADD CONSTRAINT "userGroups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userGroups" ADD CONSTRAINT "userGroups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userSettings" ADD CONSTRAINT "userSettings_defaultCalendarId_calendars_id_fk" FOREIGN KEY ("defaultCalendarId") REFERENCES "public"."calendars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userSettings" ADD CONSTRAINT "userSettings_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;