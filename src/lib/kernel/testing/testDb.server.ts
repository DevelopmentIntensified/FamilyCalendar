/**
 * Real-Postgres test harness for `*.db.test.ts` files (vitest project `db`).
 *
 * The database is `familycalendar_v2_test` on the local Docker Postgres
 * (127.0.0.1:5433), rebuilt from sql/migrations at the start of every run by
 * vitestGlobalSetup.db.ts. Two modes:
 *
 *   rollbackTest('creates a task', async (db) => {   // DEFAULT: fast, isolated
 *     const ctx = testCtx({ db });                   // everything rolls back
 *   });
 *
 *   beforeEach(truncateAll);                         // COMMITTED mode: only for
 *   it('legacy handler golden', async () => {...});  // code that uses the legacy
 *                                                    // db singleton or needs 2
 *                                                    // concurrent connections
 *
 * Lane guard: refuses any DATABASE_URL that is not the local v2 test database.
 *
 * Doc: src/lib/kernel/README.md#testing
 */
import { sql } from 'drizzle-orm';
import { it } from 'vitest';
import { connectDb, type Db, type DbHandle } from '../db/database.server';
import { assertTestDatabaseUrl } from './testDbConfig';

let handle: DbHandle | null = null;

/** The committed (non-transactional) test database. */
export function testDb(): Db {
	handle ??= connectDb(assertTestDatabaseUrl(process.env.DATABASE_URL), 4);
	return handle.db;
}

export async function closeTestDb(): Promise<void> {
	await handle?.close();
	handle = null;
}

class RollbackSignal extends Error {}

/** Run `work` inside a transaction that is always rolled back. */
export async function inRollback(work: (db: Db) => Promise<void>): Promise<void> {
	try {
		await testDb().transaction(async (tx) => {
			await work(tx);
			throw new RollbackSignal('rollback');
		});
	} catch (cause) {
		if (!(cause instanceof RollbackSignal)) throw cause;
	}
}

/** `it()` whose body gets a transaction-scoped Db that is rolled back afterwards. */
export function rollbackTest(
	name: string,
	work: (db: Db) => Promise<void>,
	timeoutMs?: number
): void {
	it(name, () => inRollback(work), timeoutMs);
}

/**
 * Empty every table (committed-mode tests). Table list is discovered, so new tables are covered.
 *
 * One transaction: `SET LOCAL session_replication_role = replica` silences the
 * foreign-key triggers, then one `DELETE FROM` per table, sent as a single
 * simple-protocol batch. Deleting ~45 tables this way resets in a few
 * milliseconds; `TRUNCATE ... CASCADE` took about 0.5 s (measured 2026-11-11).
 */
export async function truncateAll(): Promise<void> {
	const db = testDb();
	const rows = await db.execute<{ table_name: string }>(
		sql`SELECT table_name FROM information_schema.tables
		    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '__schema_migrations'`
	);
	if (rows.length === 0) return;
	const deletes = rows.map((row) => `DELETE FROM "${row.table_name}"`).join(';\n');
	await db.transaction(async (tx) => {
		// `replica` turns off FK triggers and ON DELETE CASCADE for this
		// transaction only. Every table is emptied anyway, so no row is left
		// dangling, and the reset needs no knowledge of the FK graph.
		await tx.execute(sql.raw('SET LOCAL session_replication_role = replica'));
		await tx.execute(sql.raw(deletes));
	});
}
