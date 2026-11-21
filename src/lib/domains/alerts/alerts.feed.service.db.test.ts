/**
 * alerts feed services against real Postgres: one test per IO Invariant,
 * titled after the rule. Each runs in `rollbackTest`, and `testCtx({ db })`
 * supplies the clock, the push port and the log, so nothing reads the process
 * clock and no test reaches a push service.
 *
 * Expected values come from the legacy code (`src/lib/server/db/actions/
 * notifications.ts`, `fcmService.notificationMessage`) and the frozen golden.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect, vi } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import { notifications } from '$lib/kernel/db/tables.server';
import { createMemoryPush } from '$lib/kernel/push/push';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx, type TestCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { ALERT_PAGE_SIZE } from './alerts.feed.rules';
import {
	createAlert,
	listAlertFeed,
	markAlertAsRead,
	markAllAlertsAsRead,
	pruneReadAlerts,
	pruneReadAlertsOlderThan
} from './alerts.feed.service.server';
import { seedAlert, seedDeviceToken } from './alerts.fixtures.server';

const NOW = '2026-03-01T09:00:00.000Z';
const TOKEN = 'fcm-token-for-the-feed-test';

/** The ctx with the device channel on (web stays off: no VAPID in testCtx config). */
function deviceCtx(db: Db): TestCtx {
	return {
		...testCtx({ db, now: NOW }),
		push: createMemoryPush({ devicesConfigured: true })
	};
}

/** One stored row's read stamp, or `null` — a direct read, so assertions name no service. */
async function readAtOf(db: Db, id: string): Promise<string | null> {
	const [row] = await db.select().from(notifications).where(eq(notifications.id, id));
	return row?.readAt ?? null;
}

describe('listAlertFeed', () => {
	rollbackTest('reads at most the 50 newest rows while counting every unread', async (db) => {
		const user = await seedUser(db);
		await db.insert(notifications).values(
			Array.from({ length: ALERT_PAGE_SIZE + 1 }, (_, index) => ({
				userId: user.id,
				type: 'task_completed',
				actorName: 'Sam',
				message: `alert-${index}`,
				createdAt: new Date(Date.UTC(2026, 2, 1, 0, index)).toISOString()
			}))
		);
		await seedAlert({ userId: user.id, createdAt: '2026-03-02T00:00:00.000Z' }, db);

		const feed = await listAlertFeed(testCtx({ db, now: NOW }), actorFromUser(user, 'session'));

		expect(ALERT_PAGE_SIZE).toBe(50);
		expect(feed.notifications).toHaveLength(50);
		expect(feed.unreadCount).toBe(ALERT_PAGE_SIZE + 2);
	});

	rollbackTest('guards an unrecognised type as news and keeps the row', async (db) => {
		const user = await seedUser(db);
		const stored = await seedAlert({
			userId: user.id,
			type: 'mystery_type',
			actorName: 'Alex',
			message: 'did something',
			link: null,
			createdAt: '2026-03-02T00:00:00.000Z'
		}, db);

		const feed = await listAlertFeed(testCtx({ db, now: NOW }), actorFromUser(user, 'session'));

		expect(feed.notifications).toEqual([
			{
				id: stored.id,
				type: null,
				rawType: 'mystery_type',
				group: 'news',
				actorName: 'Alex',
				message: 'did something',
				link: null,
				readAt: null,
				createdAt: stored.createdAt
			}
		]);
	});
});

describe('createAlert', () => {
	rollbackTest('stores the Alert stamped with the ctx clock and fires its push', async (db) => {
		const user = await seedUser(db);
		const ctx = deviceCtx(db);
		await seedDeviceToken(user.id, TOKEN, {}, db);

		await createAlert(
			ctx,
			actorFromUser(user, 'session'),
			{
				userId: user.id,
				type: 'assignment_pending',
				actorName: 'Kim',
				message: 'asked you to take "Bins"'
			}
		);

		const [row] = await db.select().from(notifications).where(eq(notifications.userId, user.id));
		expect({
			type: row.type,
			actorName: row.actorName,
			message: row.message,
			link: row.link,
			readAt: row.readAt,
			createdAt: row.createdAt
		}).toEqual({
			type: 'assignment_pending',
			actorName: 'Kim',
			message: 'asked you to take "Bins"',
			link: null,
			readAt: null,
			createdAt: '2026-03-01 09:00:00+00'
		});

		// The push is fired without awaiting (`void`), so wait for it to land.
		await vi.waitFor(() => expect(ctx.push.sent).toHaveLength(1));
		expect(ctx.push.sent).toEqual([
			{
				channel: 'device',
				token: TOKEN,
				body: {
					notification: { title: 'Kim', body: 'asked you to take "Bins"' },
					data: { type: 'notification', link: '/calendar/tasks' },
					android: { priority: 'high' }
				}
			}
		]);
	});

	rollbackTest('keeps an explicit link as the push tap target', async (db) => {
		const user = await seedUser(db);
		const ctx = deviceCtx(db);
		await seedDeviceToken(user.id, TOKEN, {}, db);

		await createAlert(ctx, actorFromUser(user, 'session'), {
			userId: user.id,
			type: 'task_completed',
			actorName: 'Sam',
			message: 'completed "Bins"',
			link: '/calendar/day'
		});

		await vi.waitFor(() => expect(ctx.push.sent).toHaveLength(1));
		expect(ctx.push.sent[0]).toMatchObject({
			body: { data: { type: 'notification', link: '/calendar/day' } }
		});
	});

	// Q-021: the type decides the tap target when the Alert carries no link.
	rollbackTest('taps an added_to_family push through to the family page', async (db) => {
		const user = await seedUser(db);
		const ctx = deviceCtx(db);
		await seedDeviceToken(user.id, TOKEN, {}, db);

		await createAlert(ctx, actorFromUser(user, 'session'), {
			userId: user.id,
			type: 'added_to_family',
			actorName: 'Kim',
			message: 'Kim added you to the family.'
		});

		await vi.waitFor(() => expect(ctx.push.sent).toHaveLength(1));
		expect(ctx.push.sent[0]).toMatchObject({
			body: { data: { type: 'notification', link: '/family' } }
		});
	});

	rollbackTest('logs a failed write instead of failing the caller', async (db) => {
		const user = await seedUser(db);
		const ctx = deviceCtx(db);

		// A recipient that does not exist breaks the foreign key: the caller's own
		// write already succeeded, so the Alert failure must only be logged.
		await createAlert(ctx, actorFromUser(user, 'session'), {
			userId: 'no-such-person',
			type: 'task_completed',
			actorName: 'Sam',
			message: 'completed "Bins"'
		});

		expect(ctx.log.entries).toContainEqual(
			expect.objectContaining({ level: 'error', event: 'alert_create_failed' })
		);
		expect(ctx.push.sent).toEqual([]);
	});
});

describe('markAlertAsRead', () => {
	rollbackTest('stamps only the caller row, not another persons', async (db) => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		const ctx = testCtx({ db, now: NOW });

		await markAlertAsRead(ctx, actorFromUser(user, 'session'), 'no-such-alert');
		const [same] = await db.select().from(notifications).where(eq(notifications.userId, user.id));
		expect(same).toBeUndefined();
		expect(await db.select().from(notifications)).toEqual([]);

		const mine = await seedAlert({ userId: user.id }, db);
		const theirs = await seedAlert({ userId: other.id }, db);
		await markAlertAsRead(ctx, actorFromUser(other, 'session'), theirs.id);

		const [mineAfter] = await db
			.select()
			.from(notifications)
			.where(eq(notifications.id, mine.id));
		const [theirsAfter] = await db
			.select()
			.from(notifications)
			.where(eq(notifications.id, theirs.id));
		expect(mineAfter.readAt).toBeNull();
		expect(theirsAfter.readAt).not.toBeNull();
	});
});

describe('markAllAlertsAsRead', () => {
	rollbackTest('stamps only the caller unread rows; read rows keep their stamp', async (db) => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		const ctx = testCtx({ db, now: NOW });
		const unread = await seedAlert({ userId: user.id }, db);
		const alreadyRead = await seedAlert({
			userId: user.id,
			readAt: '2026-02-01T00:00:00.000Z'
		}, db);
		const foreign = await seedAlert({ userId: other.id }, db);

		await markAllAlertsAsRead(ctx, actorFromUser(user, 'session'));

		expect(await readAtOf(db, unread.id)).not.toBeNull();
		expect(await readAtOf(db, alreadyRead.id)).toBe(alreadyRead.readAt);
		expect(await readAtOf(db, foreign.id)).toBeNull();
	});
});

describe('pruneReadAlerts', () => {
	rollbackTest('deletes only the caller read rows and returns the count', async (db) => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		const unread = await seedAlert({ userId: user.id }, db);
		await seedAlert({ userId: user.id, readAt: '2026-02-01T00:00:00.000Z' }, db);
		await seedAlert({ userId: other.id, readAt: '2026-02-01T00:00:00.000Z' }, db);

		const removed = await pruneReadAlerts(testCtx({ db, now: NOW }), actorFromUser(user, 'session'));

		expect(removed).toBe(1);
		const mine = await db.select().from(notifications).where(eq(notifications.userId, user.id));
		expect(mine.map((row) => row.id)).toEqual([unread.id]);
		expect(
			await db.select().from(notifications).where(eq(notifications.userId, other.id))
		).toHaveLength(1);
	});
});

describe('pruneReadAlertsOlderThan', () => {
	rollbackTest('prunes only read Alerts before the cutoff, across users', async (db) => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		const old = await seedAlert({ userId: user.id, readAt: '2026-01-01T00:00:00.000Z' }, db);
		const oldForeign = await seedAlert({
			userId: other.id,
			readAt: '2026-01-02T00:00:00.000Z'
		}, db);
		const fresh = await seedAlert({ userId: user.id, readAt: '2026-02-25T00:00:00.000Z' }, db);
		const unread = await seedAlert({ userId: user.id, createdAt: '2025-01-01T00:00:00.000Z' }, db);

		const removed = await pruneReadAlertsOlderThan(
			testCtx({ db, now: NOW }),
			new Date('2026-02-01T00:00:00.000Z')
		);

		expect(removed).toBe(2);
		const left = (await db.select().from(notifications)).map((row) => row.id).sort();
		expect(left).toEqual([fresh.id, unread.id].sort());
		expect(left).not.toContain(old.id);
		expect(left).not.toContain(oldForeign.id);
	});
});
