/**
 * Runtime migration runner.
 *
 * Applies any pending bundled SQL migrations against this environment's DB
 * (reads DATABASE_URL). It runs at serverless cold start — the first time a
 * function executes after a deploy — so the schema for a new commit is applied
 * automatically on whichever environment (test or prod) the code reaches,
 * with no manual step.
 *
 * Safety:
 *  - `__schema_migrations` tracks which files have been applied (exactly once).
 *  - A Postgres advisory lock serializes concurrent cold starts, so parallel
 *    serverless instances never race to run the same DDL.
 *  - Each migration runs inside a transaction.
 *  - All files are idempotent (IF NOT EXISTS), and a failure logs loudly but
 *    never crashes the caller's request — a transient/mid-migration crash is
 *    retried on the next cold start.
 */
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { bundledMigrations } from './scripts';

const TRACKING = '__schema_migrations';
let lastRun: { key: string; ok: boolean; applied: string[]; error?: string } | null = null;
let inFlight: Promise<{ ok: boolean; applied: string[] }> | null = null;

async function createTrackingTable() {
	await db.execute(sql`
		CREATE TABLE IF NOT EXISTS ${sql.raw(TRACKING)} (
			name text PRIMARY KEY,
			appliedAt timestamptz NOT NULL DEFAULT now()
		)
	`);
}

/**
 * Apply pending migrations. Safe to call many times per request and from many
 * cold starts — shared `inFlight` dedupes concurrent calls and the advisory
 * lock + tracking table handle multi-instance races.
 */
export async function runMigrations(): Promise<{ ok: boolean; applied: string[] }> {
	if (inFlight) return inFlight;
	inFlight = (async () => {
		try {
			return await runInLock();
		} catch (error) {
			console.error('[migrate] Failed to run migrations:', error);
			return { ok: false, applied: [] };
		} finally {
			inFlight = null;
		}
	})();
	return inFlight;
}

async function runInLock(): Promise<{ ok: boolean; applied: string[] }> {
	await db.execute(sql`SELECT pg_advisory_lock(${sql.raw(`hashtext('family-calendar:migrate')`)})`);
	try {
		await createTrackingTable();

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

		lastRun = { key: `${newlyApplied.length}:${pending.length}`, ok: true, applied: newlyApplied };
		return { ok: true, applied: newlyApplied };
	} finally {
		await db.execute(
			sql`SELECT pg_advisory_unlock(${sql.raw(`hashtext('family-calendar:migrate')`)})`
		);
	}
}

/** Split a SQL file into individual statements on blank-line-separated blocks. */
function splitStatements(sqlText: string): string[] {
	return sqlText
		.split(/\n\s*\n/)
		.map((s) => s.trim())
		.filter(Boolean);
}

export function getLastMigrationRun() {
	return lastRun;
}
