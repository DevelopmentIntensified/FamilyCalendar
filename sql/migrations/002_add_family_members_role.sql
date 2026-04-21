-- Add role column to familyMembers table
ALTER TABLE "familyMembers" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'member';