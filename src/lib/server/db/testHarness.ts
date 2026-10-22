// testHarness — REAL-Postgres harness helpers (#002). TEST-ONLY file: never
// imported by runtime code (only by colocated tests), so the server bundle
// never pulls it.
//
// Contract (see docs/issues/002):
//  - vitest-setup-server.ts pins the process to localhost:5433/familycalendar_test
//    before any test module resolves, so the `$lib/server/db` singleton connects
//    to the throwaway Docker database.
//  - `resetTestDb()` truncates every public table between tests; table names
//    are discovered (no hand list), so new tables are picked up automatically.
//  - Migration runtime is disabled via DATABASE_DISABLE_MIGRATIONS in the
//    vitest setup; schema comes from `npm run db:push:test`.
import postgres from 'postgres';

let truncateList: string[] | null = null;
let pool: postgres.Sql | null = null;

/** Raw pool for harness-side statements (truncate, direct row asserts).
 *  Deliberately NOT the drizzle singleton: assertions should read state as
 *  the database sees it, not through the same builder under test. */
export function testPool(): postgres.Sql {
	if (!pool) pool = postgres(process.env.DATABASE_URL!, { max: 1, ssl: 'prefer' });
	return pool;
}

/** Truncate every public table (restart identity + cascade) so each test
 *  starts from an empty schema. Discovers tables each run. */
export async function resetTestDb(): Promise<void> {
	const sql = testPool();
	if (truncateList === null) {
		const rows = await sql.unsafe<{ table_name: string }>(
			"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
		);
		truncateList = rows.map((r) => String(r.table_name));
		if (truncateList.length === 0) {
			throw new Error(
				'No tables in familycalendar_test — run `npm run db:push:test` before the harness suites.'
			);
		}
	}
	const quoted = truncateList.map((t) => `"${t}"`).join(', ');
	await sql.unsafe(`TRUNCATE ${quoted} RESTART IDENTITY CASCADE`);
}

/** Close the harness pool (call from afterAll once per worker). */
export async function closeTestPool(): Promise<void> {
	if (pool) {
		await pool.end();
		pool = null;
	}
}
