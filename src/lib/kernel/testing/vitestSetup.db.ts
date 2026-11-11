/**
 * setupFiles for vitest project `db` (vite.config.ts). Runs before every test
 * file's imports, so the legacy `$lib/server/db` singleton also lands on the
 * local v2 test database — that is what lets golden tests drive legacy route
 * handlers. Migrations at import time are disabled; vitestGlobalSetup.db.ts
 * already built the schema.
 */
import { afterAll } from 'vitest';
import { closeTestDb } from './testDb.server';
import { TEST_DATABASE_URL } from './testDbConfig';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.DATABASE_DISABLE_MIGRATIONS = '1';

afterAll(async () => {
	await closeTestDb();
});
