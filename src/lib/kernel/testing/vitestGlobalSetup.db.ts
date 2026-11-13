/**
 * globalSetup for vitest project `db`: rebuild `familycalendar_v2_test` from
 * sql/migrations on every run, exactly the way production's runner applies
 * them (name order with numeric collation, blank-line statement split, one
 * transaction per file, `__schema_migrations` tracking). ~1.5 s.
 *
 * So db tests always run against the schema production actually has, and a
 * migration that does not apply to an empty database fails the run.
 *
 * It also makes the throwaway database cheap (`synchronous_commit = off`) and
 * pins its default time zone to UTC, so `timestamptz` renders as production's
 * '2026-10-07 13:00:00+00' on any machine.
 *
 * Needs the local Docker Postgres: `docker start familycalendar-db` (created by `npm run db:up`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { splitStatements } from '../db/migrations/migrationRunner.server';
import { TEST_ADMIN_URL, TEST_DATABASE_NAME, TEST_DATABASE_URL } from './testDbConfig';

const MIGRATIONS_DIR = join(process.cwd(), 'sql', 'migrations');

export default async function setup(): Promise<void> {
	const admin = postgres(TEST_ADMIN_URL, { max: 1, onnotice: () => {}, connect_timeout: 5 });
	try {
		try {
			await admin.unsafe(`DROP DATABASE IF EXISTS ${TEST_DATABASE_NAME} WITH (FORCE)`);
			await admin.unsafe(`CREATE DATABASE ${TEST_DATABASE_NAME}`);
		} catch (cause) {
			throw new Error(
				`db tests need the local Postgres on 127.0.0.1:5433 — run \`docker start familycalendar-db\` (or \`npm run db:up\` from the main checkout) first. (${String(cause)})`
			);
		}
		try {
			// Throwaway database: skipping the commit-time WAL flush only means a
			// crash could lose the last test writes, which does not matter here. It
			// makes every committed-mode `truncateAll()` commit cheap.
			await admin.unsafe(`ALTER DATABASE ${TEST_DATABASE_NAME} SET synchronous_commit = off`);
		} catch (cause) {
			throw new Error(
				`${TEST_DATABASE_NAME} was rebuilt, but turning synchronous_commit off on it failed: ${String(cause)}`
			);
		}
		try {
			// Postgres renders `timestamptz` text through the session's TimeZone.
			// Production's server runs in UTC, so goldens assert strings like
			// '2026-10-07 13:00:00+00'; without this, a local Postgres in another
			// zone renders '+02' and every such golden fails for the wrong reason.
			// A database-level default applies to the connections the tests open
			// next (globalSetup finishes before any worker connects). The name is
			// validated in testDbConfig.ts; quote it as an identifier regardless.
			await admin.unsafe(`ALTER DATABASE "${TEST_DATABASE_NAME}" SET timezone = 'UTC'`);
		} catch (cause) {
			throw new Error(
				`${TEST_DATABASE_NAME} was rebuilt, but setting its timezone to UTC failed: ${String(cause)}`
			);
		}
	} finally {
		await admin.end({ timeout: 5 });
	}

	const db = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
	try {
		await db.unsafe(
			'CREATE TABLE IF NOT EXISTS __schema_migrations (name text PRIMARY KEY, appliedAt timestamptz NOT NULL DEFAULT now())'
		);
		for (const name of migrationFileNames()) {
			const statements = splitStatements(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'));
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

/** Same order as src/lib/kernel/db/migrations/bundledMigrations.server.ts (bundled list == files on disk, pinned by its parity test). */
function migrationFileNames(): string[] {
	return readdirSync(MIGRATIONS_DIR)
		.filter((name) => name.endsWith('.sql'))
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
