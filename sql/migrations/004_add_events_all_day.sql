-- Add allDay column to events table
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "all_day" BOOLEAN DEFAULT false NOT NULL;
