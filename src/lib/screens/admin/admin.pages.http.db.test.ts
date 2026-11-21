/**
 * The `(admin)` group layout's load through the kernel's `invokeLoad`: an
 * admin gets the two open badge counts, and the two legacy redirects hold —
 * no session `302 /login`, a signed-in non-admin `302 /calendar`.
 *
 * Not a golden: page data is internal and is redesigned with the UI (S7). The
 * `/admin` gate itself is the app's hook (its request-pipeline test owns it);
 * this pins the layout's own defence-in-depth branch, which the hook makes
 * unreachable in production (`src/routes/(admin)/+layout.server.ts:6-12`).
 *
 * Doc: ./README.md#how-to-test
 */
import { isRedirect } from '@sveltejs/kit';
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import { bugReports, unmatchedPhrases } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { invokeLoad } from '$lib/kernel/testing/invokeHandlers.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { adminLayoutLoad } from './admin.http.server';

async function redirectOf(
	promise: Promise<object>
): Promise<{ status: number; location: string } | null> {
	try {
		await promise;
		return null;
	} catch (cause) {
		if (isRedirect(cause)) return { status: cause.status, location: cause.location };
		throw cause;
	}
}

describe('(admin) layout load', () => {
	rollbackTest('answers an admin with the open badge counts', async (db) => {
		const admin = await seedUser(db, { roles: ['admin'] });
		await db.insert(bugReports).values({ area: 'calendar', description: 'Open one' });
		await db.insert(unmatchedPhrases).values([
			{ source: 'event_parse', phrase: 'call mom', sample: 'call mom' },
			{
				source: 'bulk_edit',
				phrase: 'every tuesday',
				sample: 'every tuesday',
				resolved: true
			}
		]);
		expect(
			await invokeLoad(adminLayoutLoad, {
				ctx: testCtx({ db }),
				actor: actorFromUser(admin, 'session'),
				path: '/admin'
			})
		).toEqual({ openBugs: 1, openPhrases: 1 });
	});

	rollbackTest('redirects an anonymous request 302 to /login', async (db) => {
		expect(
			await redirectOf(invokeLoad(adminLayoutLoad, { ctx: testCtx({ db }), path: '/admin' }))
		).toEqual({ status: 302, location: '/login' });
	});

	rollbackTest('redirects a signed-in non-admin 302 to /calendar', async (db) => {
		const member = await seedUser(db, { roles: [] });
		expect(
			await redirectOf(
				invokeLoad(adminLayoutLoad, {
					ctx: testCtx({ db }),
					actor: actorFromUser(member, 'session'),
					path: '/admin'
				})
			)
		).toEqual({ status: 302, location: '/calendar' });
	});
});
