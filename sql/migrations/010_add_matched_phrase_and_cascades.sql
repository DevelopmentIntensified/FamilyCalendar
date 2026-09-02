-- 010: Phrase report "matched" capture + familyInviteCodes FK cascades.
-- Phrase report stores what the parser matched vs. the typed phrase, so
-- admins can see the mismatch in the NLP report.
ALTER TABLE "unmatchedPhrases" ADD COLUMN IF NOT EXISTS "matched" text;

-- familyInviteCodes: deleting a family / user clears their invite codes.
ALTER TABLE "familyInviteCodes" DROP CONSTRAINT IF EXISTS "familyInviteCodes_familyId_families_id_fk";
ALTER TABLE "familyInviteCodes" ADD CONSTRAINT "familyInviteCodes_familyId_families_id_fk"
	FOREIGN KEY ("familyId") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "familyInviteCodes" DROP CONSTRAINT IF EXISTS "familyInviteCodes_createdBy_users_id_fk";
ALTER TABLE "familyInviteCodes" ADD CONSTRAINT "familyInviteCodes_createdBy_users_id_fk"
	FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
