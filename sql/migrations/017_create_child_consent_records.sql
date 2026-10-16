-- 190: parental-consent records for child accounts. A parent creating a child
-- account now attests to consent, and that attestation is appended here.
--
-- Same shape and rationale as 088b's `adConsentRecords`: one row per consent
-- EVENT — evidence ("did a parent consent, who, when"), not a preference.
-- Append-only; no unique key on childUserId, because a record is a trail and
-- not a current value. Cascades on user delete with every other user-scoped
-- table.
--
-- Idempotent. NOTE: this must ALSO be applied to production by hand (088's
-- precedent: applied via Neon to both branches) — do NOT rely on drizzle-kit
-- push. `child_create` is the first source; CHECK keeps bad values out even if
-- the app's writer is bypassed.
CREATE TABLE IF NOT EXISTS "childConsentRecords" (
	"id" text PRIMARY KEY NOT NULL,
	"childUserId" text NOT NULL,
	"parentUserId" text NOT NULL,
	"familyId" text NOT NULL,
	"source" text NOT NULL,
	"recordedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "childConsentRecords_childUserId_users_id_fk"
		FOREIGN KEY ("childUserId") REFERENCES "public"."users"("id")
		ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "childConsentRecords_parentUserId_users_id_fk"
		FOREIGN KEY ("parentUserId") REFERENCES "public"."users"("id")
		ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "childConsentRecords_source_check"
		CHECK ("source" IN ('child-create'))
);

-- "Prove a parent consented" is a per-child history read, newest first.
CREATE INDEX IF NOT EXISTS "child_consent_records_child_recorded_idx"
	ON "childConsentRecords" ("childUserId", "recordedAt");
