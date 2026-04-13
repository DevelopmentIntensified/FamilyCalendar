ALTER TABLE "users" RENAME COLUMN "passwordHash" TO "passwordhash";--> statement-breakpoint
ALTER TABLE "calendars" DROP CONSTRAINT "calendars_owner_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" DROP COLUMN "name";