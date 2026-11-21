/**
 * `/report-bug` page handlers through the kernel's `invokeLoad` /
 * `invokeAction`: the 302 to `/login`, the issue-257 `from` resolution and
 * the five legacy failure bodies (`{ error, area, description }`, the 401
 * before the form is read). Not a golden — the page's data is internal and is
 * redesigned with the UI (S7).
 *
 * Doc: ./README.md#how-to-test
 */
import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import { bugReports } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import {
	invokeAction,
	invokeLoad,
	isActionFailure
} from '$lib/kernel/testing/invokeHandlers.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { inRollback, rollbackTest } from '$lib/kernel/testing/testDb.server';
import { reportBugPageLoad, submitBugReportAction } from './feedback.http.server';

const ORIGIN = 'http://localhost';
const AREAS = ['calendar', 'tasks', 'account', 'payments', 'dashboard', 'other'];

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

describe('/report-bug load', () => {
	rollbackTest('redirects an anonymous visitor 302 to /login', async (db) => {
		const ctx = testCtx({ db });
		expect(await redirectOf(invokeLoad(reportBugPageLoad, { ctx, path: '/report-bug' }))).toEqual({
			status: 302,
			location: '/login'
		});
	});

	rollbackTest('resolves the reported page from ?from, then the referer', async (db) => {
		const user = await seedUser(db);
		const ctx = testCtx({ db });
		const actor = actorFromUser(user, 'session');
		expect(
			await invokeLoad(reportBugPageLoad, {
				ctx,
				actor,
				path: '/report-bug',
				query: { from: '/calendar/tasks' }
			})
		).toEqual({ areas: AREAS, from: '/calendar/tasks' });
		expect(
			await invokeLoad(reportBugPageLoad, {
				ctx,
				actor,
				path: '/report-bug',
				headers: { referer: `${ORIGIN}/account` }
			})
		).toEqual({ areas: AREAS, from: '/account' });
	});
});

describe('/report-bug submit', () => {
	rollbackTest('stores the submitted `from` path, not the POST referer', async (db) => {
		const user = await seedUser(db);
		const ctx = testCtx({ db });
		const result = await invokeAction(submitBugReportAction, {
			ctx,
			actor: actorFromUser(user, 'session'),
			path: '/report-bug',
			headers: { referer: `${ORIGIN}/report-bug` },
			form: { area: 'tasks', description: '  boom  ', from: '/calendar/tasks' }
		});
		expect(result).toEqual({ ok: true });
		const rows = await db.select().from(bugReports);
		expect(rows.map((row) => [row.userId, row.area, row.description, row.url, row.status])).toEqual([
			[user.id, 'tasks', 'boom', '/calendar/tasks', 'open']
		]);
	});

	rollbackTest('falls back from a blank hidden `from` to the POST referer', async (db) => {
		const user = await seedUser(db);
		const ctx = testCtx({ db });
		await invokeAction(submitBugReportAction, {
			ctx,
			actor: actorFromUser(user, 'session'),
			path: '/report-bug',
			headers: { referer: `${ORIGIN}/account` },
			form: { area: 'account', description: 'boom', from: '' }
		});
		const rows = await db.select().from(bugReports);
		expect(rows.map((row) => row.url)).toEqual(['/account']);
	});

	rollbackTest('ignores an off-site `from` and records the form path', async (db) => {
		const user = await seedUser(db);
		const ctx = testCtx({ db });
		await invokeAction(submitBugReportAction, {
			ctx,
			actor: actorFromUser(user, 'session'),
			path: '/report-bug',
			headers: { referer: `${ORIGIN}/report-bug` },
			form: { area: 'tasks', description: 'boom', from: 'https://evil.example/x' }
		});
		const rows = await db.select().from(bugReports);
		expect(rows.map((row) => row.url)).toEqual(['/report-bug']);
	});

	// Legacy `+page.server.ts:22-58`: signed out fails 401 before the form is
	// read (`area`/`description` blank), and each refused body echoes the
	// posted `area` and the trimmed `description`.
	it.each<
		[
			string,
			Record<string, string>,
			boolean,
			number,
			{ error: string; area: string; description: string }
		]
	>([
		[
			'a signed-out POST with an invalid form (401 before the form is read)',
			{ area: 'weather', description: '' },
			false,
			401,
			{ error: 'Please log in to report a bug.', area: '', description: '' }
		],
		[
			'an unknown area',
			{ area: 'weather', description: 'boom' },
			true,
			400,
			{ error: 'Please choose a category.', area: 'weather', description: 'boom' }
		],
		[
			'a blank description',
			{ area: 'tasks', description: '   ' },
			true,
			400,
			{ error: 'Please describe the bug.', area: 'tasks', description: '' }
		],
		[
			'a description over 5000 characters',
			{ area: 'tasks', description: 'x'.repeat(5001) },
			true,
			400,
			{
				error: 'Description is too long (max 5000 characters).',
				area: 'tasks',
				description: 'x'.repeat(5001)
			}
		]
	])('answers the legacy body for %s', (_label, form, signedIn, status, data) => {
		return inRollback(async (db) => {
			const user = signedIn ? await seedUser(db) : null;
			const ctx = testCtx({ db });
			const result = await invokeAction(submitBugReportAction, {
				ctx,
				actor: user ? actorFromUser(user, 'session') : null,
				path: '/report-bug',
				form
			});
			expect(isActionFailure(result) && result).toEqual({ status, data });
			expect(await db.select().from(bugReports)).toEqual([]);
		});
	});

	rollbackTest('answers the legacy 500 copy when the write fails', async (db) => {
		const ctx = testCtx({ db });
		// An actor whose user row does not exist violates the users foreign key.
		const result = await invokeAction(submitBugReportAction, {
			ctx,
			actor: actorFromUser({ id: 'missing-user', email: null, roles: [] }, 'session'),
			path: '/report-bug',
			form: { area: 'tasks', description: 'boom' }
		});
		expect(isActionFailure(result) && result).toEqual({
			status: 500,
			data: {
				error: 'Could not save your report. Please try again.',
				area: 'tasks',
				description: 'boom'
			}
		});
	});
});
