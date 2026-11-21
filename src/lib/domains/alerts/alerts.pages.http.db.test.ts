/**
 * `/calendar/notifications` load through the kernel's `invokeLoad`: the 302 to
 * `/login`, the same 50-row window and whole unread count the bell API reads,
 * and the server-side log line for an unrecognised stored type. Not a golden —
 * the page's data is internal and its rendering is the S7 UI.
 *
 * Doc: ./README.md#how-to-test
 */
import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { invokeLoad } from '$lib/kernel/testing/invokeHandlers.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { seedAlert } from './alerts.fixtures.server';
import { alertsPageLoad } from './alerts.http.server';

const PATH = '/calendar/notifications';

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

describe('/calendar/notifications load', () => {
	rollbackTest('redirects an anonymous visitor 302 to /login', async (db) => {
		const ctx = testCtx({ db });
		expect(await redirectOf(invokeLoad(alertsPageLoad, { ctx, path: PATH }))).toEqual({
			status: 302,
			location: '/login'
		});
	});

	rollbackTest('reads the caller feed newest first and the whole unread count', async (db) => {
		const user = await seedUser(db);
		const read = await seedAlert(
			{
				userId: user.id,
				type: 'task_completed',
				actorName: 'Leo',
				message: 'completed the bins',
				createdAt: '2026-11-19 09:00:00+00',
				readAt: '2026-11-20 10:00:00+00'
			},
			db
		);
		const unread = await seedAlert(
			{
				userId: user.id,
				type: 'assignment_pending',
				actorName: 'Sarah',
				message: 'asked you to book the wall',
				link: '/calendar/tasks',
				createdAt: '2026-11-20 09:00:00+00'
			},
			db
		);
		const ctx = testCtx({ db });
		const data = await invokeLoad(alertsPageLoad, {
			ctx,
			actor: actorFromUser(user, 'session'),
			path: PATH
		});
		expect(data.unreadCount).toBe(1);
		expect(data.notifications).toEqual([
			{
				id: unread.id,
				type: 'assignment_pending',
				rawType: 'assignment_pending',
				group: 'needs_you',
				actorName: 'Sarah',
				message: 'asked you to book the wall',
				link: '/calendar/tasks',
				readAt: null,
				createdAt: '2026-11-20 09:00:00+00'
			},
			{
				id: read.id,
				type: 'task_completed',
				rawType: 'task_completed',
				group: 'news',
				actorName: 'Leo',
				message: 'completed the bins',
				link: null,
				readAt: '2026-11-20 10:00:00+00',
				createdAt: '2026-11-19 09:00:00+00'
			}
		]);
	});

	rollbackTest('keeps an unrecognised type and logs it server-side', async (db) => {
		const user = await seedUser(db);
		await seedAlert(
			{ userId: user.id, type: 'mystery_type', message: 'did something new' },
			db
		);
		const ctx = testCtx({ db });
		const data = await invokeLoad(alertsPageLoad, {
			ctx,
			actor: actorFromUser(user, 'session'),
			path: PATH
		});
		expect(data.notifications[0]).toMatchObject({
			type: null,
			rawType: 'mystery_type',
			group: 'news'
		});
		expect(ctx.log.entries).toContainEqual(
			expect.objectContaining({
				level: 'warn',
				event: 'unrecognised_alert_types',
				fields: expect.objectContaining({ types: 'mystery_type' })
			})
		);
	});

	rollbackTest('logs nothing for a feed it can name', async (db) => {
		const user = await seedUser(db);
		await seedAlert({ userId: user.id }, db);
		const ctx = testCtx({ db });
		await invokeLoad(alertsPageLoad, {
			ctx,
			actor: actorFromUser(user, 'session'),
			path: PATH
		});
		expect(ctx.log.entries.filter((entry) => entry.event === 'unrecognised_alert_types')).toEqual(
			[]
		);
	});
});
