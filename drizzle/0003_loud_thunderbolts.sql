ALTER TABLE "calendars" DROP CONSTRAINT "calendars_family_id_families_id_fk";
--> statement-breakpoint
ALTER TABLE "codes" ADD COLUMN "type" text DEFAULT 'signup';--> statement-breakpoint
ALTER TABLE "codes" ADD COLUMN "pendingEmail" text;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;