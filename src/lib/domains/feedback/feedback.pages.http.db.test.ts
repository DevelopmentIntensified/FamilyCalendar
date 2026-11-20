/**
 * `/report-bug` page handlers through the kernel's `invokeLoad` /
 * `invokeAction`: the 302 to `/login`, the issue-257 `from` resolution and
 * the five legacy failure copies. Not a golden — the page's data is internal
 * and is redesigned with the UI (S7).
 *
 * Doc: ./README.md#how-to-test
 */
import { isRedirect } from '@sveltejs/kit';
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import { bugReports } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import {
	invokeAction,
	invokeLoad,
	isActionFailure
} from '$lib/kernel/testing/invokeHandlers.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
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

	rollbackTest('reports the form errors with the legacy copy', async (db) => {
		const user = await seedUser(db);
		const ctx = testCtx({ db });
		const actor = actorFromUser(user, 'session');
		const submit = (form: Record<string, string>, signedIn = true) =>
			invokeAction(submitBugReportAction, {
				ctx,
				actor: signedIn ? actor : null,
				path: '/report-bug',
				form
			});

		const signedOut = await submit({ area: 'tasks', description: 'boom' }, false);
		expect(isActionFailure(signedOut) && signedOut).toMatchObject({
			status: 401,
			data: { success: false, error: 'Please log in to report a bug.' }
		});
		const badArea = await submit({ area: 'weather', description: 'boom' });
		expect(isActionFailure(badArea) && badArea).toMatchObject({
			status: 400,
			data: { success: false, error: 'Please choose a category.' }
		});
		const blank = await submit({ area: 'tasks', description: '   ' });
		expect(isActionFailure(blank) && blank).toMatchObject({
			status: 400,
			data: { success: false, error: 'Please describe the bug.' }
		});
		const tooLong = await submit({ area: 'tasks', description: 'x'.repeat(5001) });
		expect(isActionFailure(tooLong) && tooLong).toMatchObject({
			status: 400,
			data: { success: false, error: 'Description is too long (max 5000 characters).' }
		});
		expect(await db.select().from(bugReports)).toEqual([]);
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
		expect(isActionFailure(result) && result).toMatchObject({
			status: 500,
			data: { success: false, error: 'Could not save your report. Please try again.' }
		});
	});
});
