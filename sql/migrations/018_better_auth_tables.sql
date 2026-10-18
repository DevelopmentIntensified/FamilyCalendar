-- 018: lucia → Better Auth session cutover (#196 slice 1, ADR-0002).
--
-- Bundled runner auto-applies this on cold start; the same file is the
-- manual prod path (repo rule — never drizzle-kit push). Idempotent.
--
-- Data policy (ADR-0002 #3/#10):
--  * lucia `sessions` rows are DROPPED, NOT migrated — sessions carry no user
--    data, and the cookie format changes anyway (old `auth_session` cookies
--    die at cutover). Recovery for the window around the cut is PITR from
--    backups, not this file.
--  * Password hashes COPY from `users.passwordHash` into
--    `auth_account.password` (bcrypt kept, no forced resets). Idempotent
--    re-run only refills rows whose account row has no password.
--  * Guests adopt better-auth's anonymous-plugin model: email-IS-NULL users
--    get a placeholder `<id>@anonymous.placeholder.invalid` (the new
--    Anonymous Account marker; the old null-email marker is gone).

-- Better Auth session table (camelCase columns, matching the drizzle schema).
CREATE TABLE IF NOT EXISTS auth_session (
	id text NOT NULL PRIMARY KEY,
	token text NOT NULL UNIQUE,
	"userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	"expiresAt" timestamp with time zone NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

-- Better Auth account table (credential provider carries the bcrypt hash).
CREATE TABLE IF NOT EXISTS auth_account (
	id text NOT NULL PRIMARY KEY,
	"userId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	"providerId" text NOT NULL,
	"accountId" text NOT NULL,
	password text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

-- Better Auth verification table (one-time tokens; consumed by slice B).
CREATE TABLE IF NOT EXISTS auth_verification (
	id text NOT NULL PRIMARY KEY,
	identifier text NOT NULL,
	value text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

-- Seed credential accounts from the existing bcrypt hashes.
INSERT INTO auth_account (id, "userId", "providerId", "accountId", password)
SELECT 'pw-' || u.id, u.id, 'credential', u.id, u."passwordhash"
FROM users u
WHERE u."passwordhash" IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Refill password for account rows created without one (idempotent re-runs).
UPDATE auth_account a
SET password = u."passwordhash"
FROM users u
WHERE a."userId" = u.id
	AND a."providerId" = 'credential'
	AND a.password IS NULL
	AND u."passwordhash" IS NOT NULL;

-- Guests → placeholder emails (better-auth anonymous model). emailVerified
-- goes false: the null-vs-false ambiguity (#6 in the review) dies with the
-- null marker.
UPDATE users
SET email = id || '@anonymous.placeholder.invalid', "emailVerified" = false
WHERE email IS NULL;

-- Old lucia sessions: dropped wholesale (see header). Kept last so a failure
-- above never silently discards live sessions before the new tables exist.
DROP TABLE IF EXISTS sessions;
