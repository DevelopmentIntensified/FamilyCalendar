ALTER TABLE "eventAttendance" DROP CONSTRAINT "eventAttendance_event_id_events_id_fk";
--> statement-breakpoint
ALTER TABLE "eventAttendance" DROP CONSTRAINT "eventAttendance_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_calendar_id_calendars_id_fk";
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_owner_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "familyMembers" DROP CONSTRAINT "familyMembers_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "familyMembers" DROP CONSTRAINT "familyMembers_family_id_families_id_fk";
--> statement-breakpoint
ALTER TABLE "eventAttendance" ADD CONSTRAINT "eventAttendance_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventAttendance" ADD CONSTRAINT "eventAttendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "familyMembers" ADD CONSTRAINT "familyMembers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "familyMembers" ADD CONSTRAINT "familyMembers_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;