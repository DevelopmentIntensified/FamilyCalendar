/**
 * Golden contract for `GET /api/admin` — the admin nav's open badge counts.
 *
 * Runs today against the legacy route on the v2 test database, and unchanged
 * after the port (S6): clients keep the same status, body, and the rule that a
 * failing count leg reads 0 instead of failing the endpoint. The failing leg is
 * made observable by dropping the column its query filters on for one request —
 * that leg's read fails while the other leg still counts real rows — then
 * restoring the exact column definition; module mocking is banned (rule R9) and
 * the legacy handler writes through the `db` singleton.
 *
 * Doc: ./README.md#invariants
 */
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { bugReports, unmatchedPhrases } from '$lib/kernel/db/tables.server';
import { invoke } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
// The ROUTE module, not the legacy service: this import survives the port.
import { GET } from '../../../routes/api/admin/+server';

const ctx = () => testCtx({ db: testDb() });

type NewBugReport = typeof bugReports.$inferInsert;
type NewPhrase = typeof unmatchedPhrases.$inferInsert;

type CountSeed = { readonly open: number; readonly resolved: number };

async function seedBugReports({ open, resolved }: CountSeed): Promise<void> {
	const rows: NewBugReport[] = [];
	for (let i = 0; i < open; i++)
		rows.push({ id: `bug-open-${i}`, area: 'calendar', description: `Open report ${i}` });
	for (let i = 0; i < resolved; i++)
		rows.push({
			id: `bug-resolved-${i}`,
			area: 'tasks',
			description: `Resolved report ${i}`,
			status: 'resolved',
			resolvedAt: new Date('2026-11-01T00:00:00.000Z')
		});
	if (rows.length > 0) await testDb().insert(bugReports).values(rows);
}

async function seedPhrases({ open, resolved }: CountSeed): Promise<void> {
	const rows: NewPhrase[] = [];
	for (let i = 0; i < open; i++)
		rows.push({
			id: `phrase-open-${i}`,
			source: 'event_parse',
			phrase: `open phrase ${i}`,
			sample: `open phrase ${i}`
		});
	for (let i = 0; i < resolved; i++)
		rows.push({
			id: `phrase-resolved-${i}`,
			source: 'bulk_edit',
			phrase: `resolved phrase ${i}`,
			sample: `resolved phrase ${i}`,
			resolved: true
		});
	if (rows.length > 0) await testDb().insert(unmatchedPhrases).values(rows);
}

describe('GET /api/admin', () => {
	beforeEach(truncateAll);

	it('returns the open badge counts for an admin', async () => {
		const admin = await seedUser(testDb(), { roles: ['admin'] });
		await seedBugReports({ open: 2, resolved: 1 });
		await seedPhrases({ open: 2, resolved: 1 });
		const res = await invoke(GET, { ctx: ctx(), user: admin, path: '/api/admin' });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ openBugs: 2, openPhrases: 2 });
	});

	it('returns zeros when nothing is open', async () => {
		const admin = await seedUser(testDb(), { roles: ['admin'] });
		const res = await invoke(GET, { ctx: ctx(), user: admin, path: '/api/admin' });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ openBugs: 0, openPhrases: 0 });
	});

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(GET, { ctx: ctx(), path: '/api/admin' });
		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	it('answers 403 {"error":"Forbidden"} for a signed-in non-admin (cookie)', async () => {
		const member = await seedUser(testDb(), { roles: [] });
		const res = await invoke(GET, { ctx: ctx(), user: member, path: '/api/admin' });
		expect(res.status).toBe(403);
		expect(res.body).toEqual({ error: 'Forbidden' });
	});

	it('lets an admin Bearer token read the counts', async () => {
		const admin = await seedUser(testDb(), { roles: ['admin'] });
		await seedBugReports({ open: 1, resolved: 0 });
		const res = await invoke(GET, {
			ctx: ctx(),
			user: admin,
			via: 'token',
			path: '/api/admin'
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ openBugs: 1, openPhrases: 0 });
	});

	it('answers 403 {"error":"Forbidden"} for a Bearer token whose owner is not an admin', async () => {
		const member = await seedUser(testDb(), { roles: [] });
		const res = await invoke(GET, {
			ctx: ctx(),
			user: member,
			via: 'token',
			path: '/api/admin'
		});
		expect(res.status).toBe(403);
		expect(res.body).toEqual({ error: 'Forbidden' });
	});

	it('degrades a failing count leg to 0 instead of 500ing the badges', async () => {
		const admin = await seedUser(testDb(), { roles: ['admin'] });
		await seedBugReports({ open: 1, resolved: 0 });
		await seedPhrases({ open: 1, resolved: 0 });
		// Make only the phrase count fail: the column its WHERE clause reads is
		// gone for the request, then restored, so the other leg still proves it
		// counted real rows.
		await testDb().execute(
			sql.raw('ALTER TABLE "unmatchedPhrases" DROP COLUMN "resolved"')
		);
		try {
			const res = await invoke(GET, { ctx: ctx(), user: admin, path: '/api/admin' });
			expect(res.status).toBe(200);
			expect(res.body).toEqual({ openBugs: 1, openPhrases: 0 });
		} finally {
			await testDb().execute(
				sql.raw('ALTER TABLE "unmatchedPhrases" ADD COLUMN "resolved" boolean NOT NULL DEFAULT false')
			);
		}
	});
});
