/**
 * Runtime migration runner.
 *
 * Applies any pending bundled SQL migrations against the `db` it is given. It
 * runs at serverless cold start — the first time a function executes after a
 * deploy — so the schema for a new commit is applied automatically on
 * whichever environment (test or prod) the code reaches, with no manual step.
 *
 * Safety (production depends on every one of these):
 *  - `__schema_migrations` tracks which files have been applied (exactly once).
 *  - A Postgres advisory lock serializes concurrent cold starts, so parallel
 *    serverless instances never race to run the same DDL.
 *  - Each migration runs inside a transaction.
 *  - All files are idempotent (IF NOT EXISTS), and a failure logs loudly but
 *    never crashes the caller's request — a transient/mid-migration crash is
 *    retried on the next cold start.
 *
 * The same blank-line statement split drives vitestGlobalSetup.db.ts, so db
 * tests are built exactly the way production applies migrations.
 *
 * Doc: src/lib/kernel/README.md#database
 */
import { sql } from 'drizzle-orm';
import type { Db } from '../database.server';
import { bundledMigrations } from './bundledMigrations.server';

const TRACKING = '__schema_migrations';
const LOCK_KEY = `hashtext('family-calendar:migrate')`;

let inFlight: Promise<{ ok: boolean; applied: string[] }> | null = null;

async function createTrackingTable(db: Db) {
	await db.execute(sql`
		CREATE TABLE IF NOT EXISTS ${sql.raw(TRACKING)} (
			name text PRIMARY KEY,
			appliedAt timestamptz NOT NULL DEFAULT now()
		)
	`);
}

/**
 * Apply pending migrations. Safe to call many times per request and from many
 * cold starts — shared `inFlight` dedupes concurrent calls (one pool per
 * deployment) and the advisory lock + tracking table handle multi-instance
 * races.
 */
export async function runMigrations(db: Db): Promise<{ ok: boolean; applied: string[] }> {
	if (inFlight) return inFlight;
	inFlight = (async () => {
		try {
			return await runInLock(db);
		} catch (error) {
			console.error('[migrate] Failed to run migrations:', error);
			return { ok: false, applied: [] };
		} finally {
			inFlight = null;
		}
	})();
	return inFlight;
}

async function runInLock(db: Db): Promise<{ ok: boolean; applied: string[] }> {
	// The first query after a cold start can hit a pooled socket the platform
	// already dropped (CONNECT_TIMEOUT mid-handshake). Retry the lock a few
	// times before giving up — a one-shot failure leaves the schema missing
	// and every session insert failing until the next cold start.
	let locked = false;
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			await db.execute(sql`SELECT pg_advisory_lock(${sql.raw(LOCK_KEY)})`);
			locked = true;
			break;
		} catch (error) {
			if (attempt === 3) throw error;
			console.error(`[migrate] lock attempt ${attempt} failed, retrying:`, error);
			const { promise, resolve } = Promise.withResolvers<void>();
			setTimeout(resolve, 1500 * attempt);
			await promise;
		}
	}
	if (!locked) throw new Error('[migrate] could not acquire the advisory lock');
	try {
		await createTrackingTable(db);

		const rows = await db.execute<{ name: string }>(sql`SELECT name FROM ${sql.raw(TRACKING)}`);
		const applied = new Set(rows.map((r) => r.name));

		const pending = bundledMigrations.filter((m) => !applied.has(m.name));
		const newlyApplied: string[] = [];

		for (const migration of pending) {
			try {
				await db.transaction(async (tx) => {
					// Some files contain multiple statements separated by newlines.
					// Execute each non-empty statement in sequence inside one tx.
					for (const statement of splitStatements(migration.sql)) {
						if (statement) await tx.execute(sql.raw(statement));
					}
					await tx.execute(sql`INSERT INTO ${sql.raw(TRACKING)} (name) VALUES (${migration.name})`);
				});
				newlyApplied.push(migration.name);
				console.log(`[migrate] applied ${migration.name}`);
			} catch (error) {
				console.error(`[migrate] failed to apply ${migration.name}:`, error);
				break;
			}
		}

		return { ok: true, applied: newlyApplied };
	} finally {
		await db.execute(sql`SELECT pg_advisory_unlock(${sql.raw(LOCK_KEY)})`);
	}
}

/** Split a SQL file into individual statements on blank-line-separated blocks. */
export function splitStatements(sqlText: string): string[] {
	return sqlText
		.split(/\n\s*\n/)
		.map((s) => s.trim())
		.filter(Boolean);
}
