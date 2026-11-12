/**
 * globalSetup for vitest project `db`: rebuild `familycalendar_v2_test` from
 * sql/migrations on every run, exactly the way production's runner applies
 * them (name order with numeric collation, blank-line statement split, one
 * transaction per file, `__schema_migrations` tracking). ~1.5 s.
 *
 * So db tests always run against the schema production actually has, and a
 * migration that does not apply to an empty database fails the run.
 *
 * Needs the local Docker Postgres: `docker start familycalendar-db` (created by `npm run db:up`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { TEST_ADMIN_URL, TEST_DATABASE_NAME, TEST_DATABASE_URL } from './testDbConfig';

const MIGRATIONS_DIR = join(process.cwd(), 'sql', 'migrations');

export default async function setup(): Promise<void> {
	const admin = postgres(TEST_ADMIN_URL, { max: 1, onnotice: () => {}, connect_timeout: 5 });
	try {
		await admin.unsafe(`DROP DATABASE IF EXISTS ${TEST_DATABASE_NAME} WITH (FORCE)`);
		await admin.unsafe(`CREATE DATABASE ${TEST_DATABASE_NAME}`);
		// Throwaway database: skipping the commit-time WAL flush only means a
		// crash could lose the last test writes, which does not matter here. It
		// makes every committed-mode `truncateAll()` commit cheap.
		await admin.unsafe(`ALTER DATABASE ${TEST_DATABASE_NAME} SET synchronous_commit = off`);
	} catch (cause) {
		throw new Error(
			`db tests need the local Postgres on 127.0.0.1:5433 — run \`docker start familycalendar-db\` (or \`npm run db:up\` from the main checkout) first. (${String(cause)})`
		);
	} finally {
		await admin.end({ timeout: 5 });
	}

	const db = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
	try {
		await db.unsafe(
			'CREATE TABLE IF NOT EXISTS __schema_migrations (name text PRIMARY KEY, appliedAt timestamptz NOT NULL DEFAULT now())'
		);
		for (const name of migrationFileNames()) {
			const statements = readFileSync(join(MIGRATIONS_DIR, name), 'utf8')
				.split(/\n\s*\n/)
				.map((statement) => statement.trim())
				.filter(Boolean);
			try {
				await db.begin(async (tx) => {
					for (const statement of statements) await tx.unsafe(statement);
					await tx.unsafe('INSERT INTO __schema_migrations (name) VALUES ($1)', [name]);
				});
			} catch (cause) {
				throw new Error(`migration ${name} failed on an empty database: ${String(cause)}`);
			}
		}
	} finally {
		await db.end({ timeout: 5 });
	}
}

/** Same order as src/lib/server/db/migrations/scripts.ts (bundled list == files on disk, pinned by its parity test). */
function migrationFileNames(): string[] {
	return readdirSync(MIGRATIONS_DIR)
		.filter((name) => name.endsWith('.sql'))
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
