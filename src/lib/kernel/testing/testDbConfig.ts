/**
 * Where db tests run. Separate from testDb.server.ts because vitest's
 * globalSetup must not import `vitest` (it runs outside the test workers).
 *
 * Parallel worktrees set `V2_TEST_DB=familycalendar_v2_test_<id>` so their
 * runs rebuild and use their own database instead of clobbering each other's
 * (docs/rewrite/playbooks/orchestrate.md).
 */
const DEFAULT_TEST_DATABASE_NAME = 'familycalendar_v2_test';
const TEST_DATABASE_NAME_PATTERN = /^familycalendar_v2_test(_[a-z0-9]+)?$/;

function testDatabaseName(): string {
	const name = process.env.V2_TEST_DB ?? DEFAULT_TEST_DATABASE_NAME;
	if (!TEST_DATABASE_NAME_PATTERN.test(name)) {
		throw new Error(`V2_TEST_DB must match ${TEST_DATABASE_NAME_PATTERN} (got ${name}).`);
	}
	return name;
}

export const TEST_DATABASE_NAME = testDatabaseName();
export const TEST_DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:5433/${TEST_DATABASE_NAME}`;
export const TEST_ADMIN_URL = 'postgres://postgres:postgres@127.0.0.1:5433/postgres';

/** Lane guard: db tests may only touch the local v2 test database, never Neon. */
export function assertTestDatabaseUrl(url: string | undefined): string {
	if (url !== TEST_DATABASE_URL) {
		throw new Error(
			`DB lane guard: db tests may only use ${TEST_DATABASE_URL} (got ${url ?? '(empty)'}). Never point tests at Neon.`
		);
	}
	return url;
}
