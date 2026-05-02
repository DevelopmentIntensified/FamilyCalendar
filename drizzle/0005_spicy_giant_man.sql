ALTER TABLE "eventAttendance" DROP CONSTRAINT "eventAttendance_event_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "eventAttendance" ADD COLUMN "id" text PRIMARY KEY NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "event_attendance_user_unique" ON "eventAttendance" USING btree ("event_id","user_id") WHERE user_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "event_attendance_name_unique" ON "eventAttendance" USING btree ("event_id","name") WHERE name IS NOT NULL;