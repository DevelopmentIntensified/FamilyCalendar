-- 009: Bug reports - user-submitted bug collection for the in-app report form.
CREATE TABLE IF NOT EXISTS "bugReports" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text REFERENCES "users"("id") ON DELETE SET NULL,
	"area" text NOT NULL,
	"description" text NOT NULL,
	"url" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolvedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "bug_reports_status_created_idx" ON "bugReports" ("status", "createdAt");
