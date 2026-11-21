/**
 * `GET /api/admin`'s gate, pinned against the ported handler: no session →
 * `401 {"error":"Unauthorized"}`, a signed-in non-admin → `403
 * {"error":"Forbidden"}`, an admin → `200` with the open counts.
 *
 * The S2 golden (`admin.http.db.test.ts`) pins the wire it was written against;
 * this file keeps the gate pinned by a v2 test now that the legacy route test
 * (`src/routes/api/admin/server.test.ts`, deleted) can no longer reach it — it
 * mocked legacy actions the ported handler never reads and never handed the
 * kernel endpoint a `locals.ctx`.
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import { bugReports } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { invoke } from '$lib/kernel/testing/invokeHandlers.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { adminCountsEndpoint } from './admin.http.server';

describe('GET /api/admin gate', () => {
	rollbackTest('answers 401 {"error":"Unauthorized"} without a session', async (db) => {
		const res = await invoke(adminCountsEndpoint.handler, {
			ctx: testCtx({ db }),
			path: '/api/admin'
		});
		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	rollbackTest('answers 403 {"error":"Forbidden"} for a signed-in non-admin', async (db) => {
		const member = await seedUser(db, { roles: [] });
		const res = await invoke(adminCountsEndpoint.handler, {
			ctx: testCtx({ db }),
			actor: actorFromUser(member, 'session'),
			path: '/api/admin'
		});
		expect(res.status).toBe(403);
		expect(res.body).toEqual({ error: 'Forbidden' });
	});

	rollbackTest('answers the open badge counts for an admin', async (db) => {
		const admin = await seedUser(db, { roles: ['admin'] });
		await db.insert(bugReports).values({ area: 'calendar', description: 'Open one' });
		const res = await invoke(adminCountsEndpoint.handler, {
			ctx: testCtx({ db }),
			actor: actorFromUser(admin, 'session'),
			path: '/api/admin'
		});
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ openBugs: 1, openPhrases: 0 });
	});
});
