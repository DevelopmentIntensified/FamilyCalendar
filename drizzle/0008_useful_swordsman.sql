CREATE TABLE "meals" (
	"id" text PRIMARY KEY NOT NULL,
	"familyId" text NOT NULL,
	"date" text NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"createdBy" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "familyMembers" ADD COLUMN "memberType" text DEFAULT 'member';--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_familyId_families_id_fk" FOREIGN KEY ("familyId") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;