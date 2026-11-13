// Wait until the pages server has migrated its database.
//
// `serve.ts` only starts `vite preview`; the schema arrives when the built
// server's hooks run the kernel `runMigrations` (the production cold-start
// path), asynchronously and off the request path. Seeds must not run before
// that lands, or they insert into tables that do not exist yet.
//
// Wired as `globalSetup` in playwright.pages.config.ts: Playwright starts the
// webServer first, then runs this, then the tests.
//
// Doc: e2e/pages/README.md
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { PAGES_BASE_URL, PAGES_DATABASE_URL } from './env';

/**
 * The repo root. NOT Playwright's `rootDir` (that is the resolved testDir,
 * i.e. e2e/pages — `node_modules/playwright/lib/common/config.js` sets
 * `rootDir: pathResolve(configDir, testDir)`), and not `process.cwd()`: this
 * file is loaded from where it lives, so climb out of e2e/pages.
 */
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const TIMEOUT_MS = 60_000;
const POLL_MS = 500;

/** How many migrations the schema must end up with: the .sql files on disk. */
function migrationFileCount(): number {
	return readdirSync(path.join(REPO_ROOT, 'sql/migrations')).filter((name) =>
		name.endsWith('.sql')
	).length;
}

/** Postgres `undefined_table`: the tracking table before the first migration. */
function isMissingTable(error: unknown): boolean {
	return typeof error === 'object' && error !== null && 'code' in error && error.code === '42P01';
}

async function appliedCount(sql: postgres.Sql): Promise<number> {
	try {
		const rows = await sql.unsafe<{ applied: number }[]>(
			'select count(*)::int as applied from "__schema_migrations"'
		);
		return rows[0]?.applied ?? 0;
	} catch (error) {
		if (isMissingTable(error)) return 0;
		throw error;
	}
}

export default async function globalSetup(): Promise<void> {
	// One request, so the server has certainly loaded its hooks module (and
	// therefore started the migration run). Playwright already waited on the
	// port; this is the first request that exercises the app's own path.
	await fetch(PAGES_BASE_URL, { redirect: 'manual' }).catch(() => undefined);

	const expected = migrationFileCount();
	const sql = postgres(PAGES_DATABASE_URL, { max: 1, onnotice: () => {} });
	try {
		const deadline = Date.now() + TIMEOUT_MS;
		let applied = await appliedCount(sql);
		while (applied < expected) {
			if (Date.now() > deadline) {
				throw new Error(
					`[pages] migrations did not land within ${TIMEOUT_MS / 1000}s: ` +
						`sql/migrations has ${expected} .sql files, "__schema_migrations" has ${applied}. ` +
						'The preview server runs them at cold start — check its output for a [migrate] error.'
				);
			}
			await delay(POLL_MS);
			applied = await appliedCount(sql);
		}
	} finally {
		await sql.end({ timeout: 5 });
	}
}
