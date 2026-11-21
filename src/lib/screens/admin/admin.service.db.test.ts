/**
 * admin's badge counts against real Postgres: the open-only reads, the zeros
 * with nothing open, and the per-leg degrade to 0 with one `admin_count_failed`
 * warning — legacy `guard('admin-counts', 0, …)`
 * (`src/lib/server/services/adminData.ts:33-40`), where one broken count left
 * the other real and never failed the page.
 *
 * Seeds `feedback`'s rows directly: this screen owns no tables and no fixtures
 * (README How to test), and a db test may insert them (rule R3).
 *
 * Doc: ./README.md#how-to-test
 */
import { sql } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { bugReports, unmatchedPhrases } from '$lib/kernel/db/tables.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { getAdminCounts } from './admin.service.server';

describe('getAdminCounts', () => {
	rollbackTest('counts open rows only, per register', async (db) => {
		await db.insert(bugReports).values([
			{ area: 'calendar', description: 'Open one' },
			{ area: 'tasks', description: 'Open two' },
			{
				area: 'account',
				description: 'Resolved report',
				status: 'resolved',
				resolvedAt: new Date('2026-02-01T09:00:00.000Z')
			}
		]);
		await db.insert(unmatchedPhrases).values([
			{ source: 'event_parse', phrase: 'call mom', sample: 'call mom' },
			{
				source: 'bulk_edit',
				phrase: 'every tuesday',
				sample: 'every tuesday',
				resolved: true
			}
		]);
		expect(await getAdminCounts(testCtx({ db }))).toEqual({ openBugs: 2, openPhrases: 1 });
	});

	rollbackTest('answers zeros when nothing is open', async (db) => {
		expect(await getAdminCounts(testCtx({ db }))).toEqual({ openBugs: 0, openPhrases: 0 });
	});

	rollbackTest('degrades a failing leg to 0 and logs admin_count_failed', async (db) => {
		await db.insert(bugReports).values({ area: 'calendar', description: 'Open one' });
		await db.insert(unmatchedPhrases).values({
			source: 'event_parse',
			phrase: 'call mom',
			sample: 'call mom'
		});
		// Make only the phrase count fail, the way the golden does: the column
		// its WHERE clause reads is gone for this (rolled-back) transaction.
		await db.execute(sql.raw('ALTER TABLE "unmatchedPhrases" DROP COLUMN "resolved"'));
		const ctx = testCtx({ db });
		expect(await getAdminCounts(ctx)).toEqual({ openBugs: 1, openPhrases: 0 });
		expect(ctx.log.entries).toEqual([
			{
				level: 'warn',
				event: 'admin_count_failed',
				fields: { leg: 'openPhrases', message: expect.any(String) }
			}
		]);
		// A degraded badge is not a fault: nothing is filed as a bug report.
		expect(ctx.faults.reports).toEqual([]);
	});
});
