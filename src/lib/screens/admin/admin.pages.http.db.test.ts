/**
 * The `(admin)` group layout load and the two register pages through the
 * kernel's `invokeLoad` / `invokeAction`: an admin gets the badge counts and
 * the register rows, the two legacy redirects hold on the layout (no session
 * `302 /login`, a signed-in non-admin `302 /calendar`), and each page's
 * resolve action keeps the legacy `{ success: true }` answer.
 *
 * Not a golden: page data is internal and is redesigned with the UI (S7). The
 * `/admin` gate itself is the app's hook (its request-pipeline test owns it);
 * this pins the layout's own defence-in-depth branch, which the hook makes
 * unreachable in production (`src/routes/(admin)/+layout.server.ts:6-12`).
 *
 * Doc: ./README.md#how-to-test
 */
import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import { bugReports, unmatchedPhrases } from '$lib/kernel/db/tables.server';
import type { ActionFail } from '$lib/kernel/http/pageHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import {
	invokeAction,
	invokeLoad,
	isActionFailure
} from '$lib/kernel/testing/invokeHandlers.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { inRollback, rollbackTest } from '$lib/kernel/testing/testDb.server';
import {
	adminBugRegisterPageLoad,
	adminLayoutLoad,
	adminPhraseRegisterPageLoad,
	adminResolveBugReportAction,
	adminResolveUnmatchedPhraseAction
} from './admin.http.server';

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

describe('register page loads', () => {
	rollbackTest('/admin/bugs answers the register rows, the clock and the zone', async (db) => {
		const admin = await seedUser(db, { roles: ['admin'] });
		const reporter = await seedUser(db, { firstName: 'Ada', lastName: 'Lovelace' });
		await db.insert(bugReports).values([
			{ area: 'calendar', description: 'Open one', userId: reporter.id },
			{
				area: 'tasks',
				description: 'Fixed one',
				userId: reporter.id,
				status: 'resolved',
				resolvedAt: new Date('2026-10-01T00:00:00.000Z')
			}
		]);
		const data = await invokeLoad(adminBugRegisterPageLoad, {
			ctx: testCtx({ db }),
			actor: actorFromUser(admin, 'session'),
			path: '/admin/bugs'
		});
		expect(data.open.map((row) => [row.description, row.reporterFirstName])).toEqual([
			['Open one', 'Ada']
		]);
		expect(data.resolved.map((row) => row.description)).toEqual(['Fixed one']);
		expect(data.zone).toBe('UTC');
		expect(data.now).toBeInstanceOf(Date);
	});

	rollbackTest('/admin/nlp answers the phrases newest by frequency, the clock and the zone', async (db) => {
		const admin = await seedUser(db, { roles: ['admin'] });
		await db.insert(unmatchedPhrases).values([
			{ source: 'event_parse', phrase: 'call mom', sample: 'call mom', count: 3 },
			{ source: 'bulk_edit', phrase: 'every tuesday', sample: 'every tuesday', count: 1 },
			{
				source: 'event_parse',
				phrase: 'old phrase',
				sample: 'old phrase',
				resolved: true
			}
		]);
		const data = await invokeLoad(adminPhraseRegisterPageLoad, {
			ctx: testCtx({ db }),
			actor: actorFromUser(admin, 'session'),
			path: '/admin/nlp'
		});
		expect(data.open.map((row) => row.phrase)).toEqual(['call mom', 'every tuesday']);
		expect(data.resolved.map((row) => row.phrase)).toEqual(['old phrase']);
		expect(data.zone).toBe('UTC');
		expect(data.now).toBeInstanceOf(Date);
	});

	it.each<[string, boolean]>([
		['an anonymous request', false],
		['a signed-in non-admin', true]
	])('redirects %s the way the layout does', (_label, signedIn) =>
		inRollback(async (db) => {
			const member = signedIn ? await seedUser(db, { roles: [] }) : null;
			const ctx = testCtx({ db });
			const actor = member ? actorFromUser(member, 'session') : null;
			const expected = signedIn
				? { status: 302, location: '/calendar' }
				: { status: 302, location: '/login' };
			expect(
				await redirectOf(
					invokeLoad(adminBugRegisterPageLoad, { ctx, actor, path: '/admin/bugs' })
				)
			).toEqual(expected);
			expect(
				await redirectOf(invokeLoad(adminPhraseRegisterPageLoad, { ctx, actor, path: '/admin/nlp' }))
			).toEqual(expected);
		})
	);
});

describe('register resolve actions', () => {
	rollbackTest('/admin/bugs?/resolve marks the report resolved and keeps answering success', async (db) => {
		const admin = await seedUser(db, { roles: ['admin'] });
		const [report] = await db
			.insert(bugReports)
			.values({ area: 'tasks', description: 'Broken' })
			.returning();
		const ctx = testCtx({ db });
		const actor = actorFromUser(admin, 'session');
		expect(
			await invokeAction(adminResolveBugReportAction, {
				ctx,
				actor,
				path: '/admin/bugs',
				form: { id: report.id }
			})
		).toEqual({ success: true });
		const [row] = await db.select().from(bugReports);
		expect([row.status, row.resolvedAt instanceof Date]).toEqual(['resolved', true]);
		expect(
			await invokeAction(adminResolveBugReportAction, {
				ctx,
				actor,
				path: '/admin/bugs',
				form: { id: report.id }
			})
		).toEqual({ success: true });
	});

	// Legacy `resolveBugReport(id)` updated-or-nothing and answered success:
	// an unknown id and a blank id were no-ops, never 404s or 400s.
	rollbackTest('treats an unknown and a blank id as a no-op success', async (db) => {
		const admin = await seedUser(db, { roles: ['admin'] });
		await db.insert(bugReports).values({ area: 'tasks', description: 'Broken' });
		const ctx = testCtx({ db });
		const actor = actorFromUser(admin, 'session');
		for (const id of ['00000000-0000-4000-8000-000000000000', '']) {
			expect(
				await invokeAction(adminResolveBugReportAction, {
					ctx,
					actor,
					path: '/admin/bugs',
					form: { id }
				})
			).toEqual({ success: true });
		}
		const rows = await db.select().from(bugReports);
		expect(rows.map((row) => row.resolvedAt)).toEqual([null]);
	});

	rollbackTest('/admin/nlp?/resolve marks the phrase resolved', async (db) => {
		const admin = await seedUser(db, { roles: ['admin'] });
		const [phrase] = await db
			.insert(unmatchedPhrases)
			.values({ source: 'event_parse', phrase: 'call mom', sample: 'call mom' })
			.returning();
		expect(
			await invokeAction(adminResolveUnmatchedPhraseAction, {
				ctx: testCtx({ db }),
				actor: actorFromUser(admin, 'session'),
				path: '/admin/nlp',
				form: { id: phrase.id }
			})
		).toEqual({ success: true });
		const [row] = await db.select().from(unmatchedPhrases);
		expect(row.resolved).toBe(true);
	});

	it.each<[string, boolean, number, string]>([
		['a signed-out POST', false, 401, 'Not signed in'],
		['a signed-in non-admin', true, 403, 'Forbidden']
	])('refuses %s on both actions', (_label, signedIn, status, error) =>
		inRollback(async (db) => {
			const member = signedIn ? await seedUser(db, { roles: [] }) : null;
			const ctx = testCtx({ db });
			const actor = member ? actorFromUser(member, 'session') : null;
			for (const action of [adminResolveBugReportAction, adminResolveUnmatchedPhraseAction]) {
				const result = await invokeAction(action, {
					ctx,
					actor,
					path: '/admin/bugs',
					form: { id: 'x' }
				});
				expect(isActionFailure<ActionFail, { success: true }>(result) && result).toEqual({
					status,
					data: { success: false, error }
				});
			}
		})
	);
});
