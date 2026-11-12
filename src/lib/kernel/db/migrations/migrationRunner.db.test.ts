/**
 * Migration runner behaviour against the real test database.
 *
 * The test database is built from `sql/migrations` by vitestGlobalSetup.db.ts
 * (same `splitStatements`, same `__schema_migrations` tracking), so a runner
 * pass over it must be a no-op: 0 files applied, `ok: true`. That is the
 * cold-start safety property production relies on — every deploy re-runs the
 * runner and only pending files touch the schema.
 *
 * The failing case drives the runner's migration-list seam, so it needs no new
 * file under `sql/migrations`: the file's transaction rolls back, nothing is
 * tracked, and the result names the file that broke instead of claiming
 * success.
 *
 * Doc: src/lib/kernel/README.md#database
 */
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { uniqueSuffix } from '../../testing/seedRows.server';
import { testDb } from '../../testing/testDb.server';
import { runMigrations } from './migrationRunner.server';

describe('runMigrations', () => {
	it('applies nothing to the already-migrated test database and reports success', async () => {
		const result = await runMigrations(testDb());

		expect(result).toEqual({ ok: true, applied: [] });
	});

	it('rolls back a failing file and reports it instead of claiming success', async () => {
		const name = `__failing_${uniqueSuffix()}.sql`;

		const result = await runMigrations(testDb(), [
			{
				name,
				sql: 'CREATE TABLE __failing_migration_probe (id integer);\n\nSELECT * FROM __no_such_table;'
			}
		]);

		expect(result).toEqual({ ok: false, applied: [], failed: name });
		const [leaked] = await testDb().execute<{ relation: string | null }>(
			sql`SELECT to_regclass('public.__failing_migration_probe')::text AS relation`
		);
		expect(leaked.relation).toBeNull();
		const tracked = await testDb().execute<{ name: string }>(
			sql`SELECT name FROM __schema_migrations WHERE name = ${name}`
		);
		expect(tracked).toHaveLength(0);
	});
});
