-- 023 — device_tokens: FCM registration tokens for the Android app (#272).
-- Idempotent. Additive; existing clients unaffected.
-- One row per device token; a token re-registered by another user is re-owned
-- (token is UNIQUE). Rows go with the user (ON DELETE CASCADE) and are pruned
-- by the sender when FCM reports the token UNREGISTERED / invalid.
CREATE TABLE IF NOT EXISTS "device_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
	"token" text NOT NULL UNIQUE,
	"platform" text DEFAULT 'android' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "device_tokens_user_id_idx" ON "device_tokens" ("user_id");
