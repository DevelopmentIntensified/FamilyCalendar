-- 016 — personal API tokens (TaskFocus Bearer auth). Idempotent.
-- Only the SHA-256 hash is stored; the plaintext is shown once at creation.
CREATE TABLE IF NOT EXISTS "api_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
	"name" text NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "api_tokens_user_id_idx" ON "api_tokens" ("user_id");
