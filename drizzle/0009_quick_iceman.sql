CREATE TABLE "bugReports" (
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
CREATE TABLE "taskTags" (
	"taskId" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "taskTags_taskId_name_pk" PRIMARY KEY("taskId","name")
);
--> statement-breakpoint
ALTER TABLE "familyInviteCodes" DROP CONSTRAINT "familyInviteCodes_familyId_families_id_fk";
--> statement-breakpoint
ALTER TABLE "familyInviteCodes" DROP CONSTRAINT "familyInviteCodes_createdBy_users_id_fk";
--> statement-breakpoint
ALTER TABLE "unmatchedPhrases" ADD COLUMN "matched" text;--> statement-breakpoint
ALTER TABLE "bugReports" ADD CONSTRAINT "bugReports_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taskTags" ADD CONSTRAINT "taskTags_taskId_tasks_id_fk" FOREIGN KEY ("taskId") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bug_reports_status_created_idx" ON "bugReports" USING btree ("status","createdAt");--> statement-breakpoint
ALTER TABLE "familyInviteCodes" ADD CONSTRAINT "familyInviteCodes_familyId_families_id_fk" FOREIGN KEY ("familyId") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "familyInviteCodes" ADD CONSTRAINT "familyInviteCodes_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;