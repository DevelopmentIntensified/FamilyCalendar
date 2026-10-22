import { beforeAll } from 'vitest';

/**
 * Vitest setup for the `server` project (hooked from vite.config.ts).
 *
 * THE DATABASE LANE GUARD: every server test file that imports
 * `$lib/server/db` gets the module-level singleton, which reads
 * DATABASE_URL at import time — and the repo's own `.env` points that at
 * the production Neon branch. The harness (#002) therefore pins the env
 * to the throwaway local Docker database BEFORE any test module resolves,
 * so no server test can ever reach a cloud database.
 *
 * Hard pin, fail-loud: if someone edits `.env` DATABASE_URL or this file,
 * the following assertions are the guardrail, not a convenience.
 */
const PINNED_TEST_DB = 'postgres://postgres:postgres@127.0.0.1:5433/familycalendar_test';

if (process.env.DATABASE_URL !== PINNED_TEST_DB) {
	process.env.DATABASE_URL = PINNED_TEST_DB;
}

// The migrations runner fires at cold start (hooks.server.ts); nothing in
// the vitest import graph should ever run it against ANY database.
process.env.DATABASE_DISABLE_MIGRATIONS = '1';

beforeAll(() => {
	// Second layer: if some module re-reads the env after this file ran and
	// it no longer matches, fail before touching the data under it. Note the
	// IP not `localhost`: another local Postgres on this machine also
	// LISTENs on [::1]:5433, and localhost resolves to it first — the Docker
	// harness db is reachable on 127.0.0.1 only.
	if (!process.env.DATABASE_URL?.includes('@127.0.0.1:5433/familycalendar_test')) {
		throw new Error(
			`DB lane guard violated: vitest DATABASE_URL must stay on the local harness database (got ${process.env.DATABASE_URL ?? '(empty)'})`
		);
	}
});
