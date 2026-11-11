/**
 * Where db tests run. Separate from testDb.server.ts because vitest's
 * globalSetup must not import `vitest` (it runs outside the test workers).
 */
export const TEST_DATABASE_NAME = 'familycalendar_v2_test';
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
