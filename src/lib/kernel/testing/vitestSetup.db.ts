/**
 * setupFiles for vitest project `db` (vite.config.ts). Runs before every test
 * file's imports, so the legacy `$lib/server/db` singleton also lands on the
 * local v2 test database — that is what lets golden tests drive legacy route
 * handlers. Migrations at import time are disabled; vitestGlobalSetup.db.ts
 * already built the schema.
 */
import { afterAll } from 'vitest';
import { closeTestDb, truncateAll } from './testDb.server';
import { TEST_DATABASE_URL } from './testDbConfig';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.DATABASE_DISABLE_MIGRATIONS = '1';

// Every file leaves an empty database: committed-mode goldens truncate only
// before each test, so their last test's rows would otherwise reach the next
// file in the fork (a rollback repo test would see them). One truncate per
// file costs ~0.1 s (K-09).
afterAll(async () => {
	await truncateAll();
	await closeTestDb();
});
