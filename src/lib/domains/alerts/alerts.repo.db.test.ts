/**
 * The alerts repo against real Postgres: every query that filters, orders,
 * upserts, deletes or applies a cutoff. Each test runs in `rollbackTest`, so
 * the rows it seeds vanish afterwards. Writes are given their `now`, so the
 * tests assert the stamped timestamps instead of trusting a clock.
 *
 * `notifications.readAt` / `createdAt` and `pushSubscriptions.createdAt` are
 * `mode: 'string'` columns: reads give back the Postgres text render
 * (`2026-04-01 12:00:00+00`; the test database runs in UTC), so the stamps are
 * asserted in that render.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import {
	deviceTokens,
	notifications,
	pushSubscriptions,
	subscriptions
} from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import {
	seedAlert,
	seedAlertPreferencesRow,
	seedDeviceToken,
	seedPushSubscription
} from './alerts.fixtures.server';
import {
	countUnreadAlerts,
	deleteDeadDeviceToken,
	deleteDeviceToken,
	deletePushSubscription,
	deleteReadAlerts,
	deleteReadAlertsBefore,
	findAlertPreferencesRow,
	insertAlert,
	insertAlertPreferencesRow,
	listAlerts,
	listDeviceTokens,
	listPushSubscriptions,
	markAlertRead,
	markAllAlertsRead,
	updateAlertPreferencesRow,
	upsertDeviceToken,
	upsertPushSubscription
} from './alerts.repo.server';

const NOW = new Date('2026-04-01T12:00:00Z');
const NOW_RENDER = '2026-04-01 12:00:00+00';
const READ = '2026-03-02T11:00:00.000Z';

describe('alerts', () => {
	rollbackTest('insertAlert stamps createdAt with now and returns the row', async (db) => {
		const user = await seedUser(db);
		const row = await insertAlert(
			db,
			{
				userId: user.id,
				type: 'assignment_pending',
				actorName: 'Kim',
				message: 'asked you to take "Bins"',
				link: '/calendar/tasks'
			},
			NOW
		);
		expect({
			userId: row.userId,
			type: row.type,
			actorName: row.actorName,
			message: row.message,
			link: row.link,
			readAt: row.readAt,
			createdAt: row.createdAt
		}).toEqual({
			userId: user.id,
			type: 'assignment_pending',
			actorName: 'Kim',
			message: 'asked you to take "Bins"',
			link: '/calendar/tasks',
			readAt: null,
			createdAt: NOW_RENDER
		});
	});

	rollbackTest('insertAlert stores an omitted link as null', async (db) => {
		const user = await seedUser(db);
		const row = await insertAlert(
			db,
			{ userId: user.id, type: 'task_completed', actorName: 'Sam', message: 'did it' },
			NOW
		);
		expect(row.link).toBeNull();
	});

	rollbackTest('listAlerts answers the caller newest first and no one else', async (db) => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		const oldest = await seedAlert({ userId: user.id, createdAt: '2026-03-01T09:00:00.000Z' }, db);
		const newest = await seedAlert({ userId: user.id, createdAt: '2026-03-03T09:00:00.000Z' }, db);
		const middle = await seedAlert({ userId: user.id, createdAt: '2026-03-02T09:00:00.000Z' }, db);
		await seedAlert({ userId: other.id, createdAt: '2026-03-04T09:00:00.000Z' }, db);

		const rows = await listAlerts(db, user.id, 50);
		expect(rows.map((row) => row.id)).toEqual([newest.id, middle.id, oldest.id]);
	});

	rollbackTest('listAlerts keeps only the newest rows within the limit', async (db) => {
		const user = await seedUser(db);
		const oldest = await seedAlert({ userId: user.id, createdAt: '2026-03-01T09:00:00.000Z' }, db);
		const newest = await seedAlert({ userId: user.id, createdAt: '2026-03-03T09:00:00.000Z' }, db);
		const middle = await seedAlert({ userId: user.id, createdAt: '2026-03-02T09:00:00.000Z' }, db);

		const rows = await listAlerts(db, user.id, 2);
		expect(rows.map((row) => row.id)).toEqual([newest.id, middle.id]);
		expect(rows.map((row) => row.id)).not.toContain(oldest.id);
	});

	rollbackTest('listAlerts answers no rows for a user with none', async (db) => {
		const user = await seedUser(db);
		expect(await listAlerts(db, user.id, 50)).toEqual([]);
	});

	rollbackTest(
		'countUnreadAlerts counts every unread row of the caller, beyond any window, and no read or foreign row',
		async (db) => {
			const user = await seedUser(db);
			const other = await seedUser(db);
			await db.insert(notifications).values(
				Array.from({ length: 55 }, (_, index) => ({
					userId: user.id,
					type: 'task_completed',
					actorName: 'Sam',
					message: `alert-${index}`
				}))
			);
			await seedAlert({ userId: user.id, readAt: READ }, db);
			await seedAlert({ userId: other.id }, db);

			expect(await countUnreadAlerts(db, user.id)).toBe(55);
			expect(await countUnreadAlerts(db, other.id)).toBe(1);
		}
	);

	rollbackTest('countUnreadAlerts is zero when everything is read', async (db) => {
		const user = await seedUser(db);
		await seedAlert({ userId: user.id, readAt: READ }, db);
		expect(await countUnreadAlerts(db, user.id)).toBe(0);
	});

	rollbackTest('markAlertRead stamps the caller row with now and leaves the others', async (db) => {
		const user = await seedUser(db);
		const target = await seedAlert({ userId: user.id }, db);
		const sibling = await seedAlert({ userId: user.id }, db);

		await markAlertRead(db, user.id, target.id, NOW);

		const [after] = await db.select().from(notifications).where(eq(notifications.id, target.id));
		expect(after.readAt).toBe(NOW_RENDER);
		const [untouched] = await db.select().from(notifications).where(eq(notifications.id, sibling.id));
		expect(untouched.readAt).toBeNull();
	});

	rollbackTest('markAlertRead ignores another persons row and an unknown id', async (db) => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		const foreign = await seedAlert({ userId: other.id }, db);

		await markAlertRead(db, user.id, foreign.id, NOW);
		await markAlertRead(db, user.id, 'no-such-alert', NOW);

		const [after] = await db.select().from(notifications).where(eq(notifications.id, foreign.id));
		expect(after.readAt).toBeNull();
	});

	rollbackTest('markAlertRead stamps an already read row again (no readAt IS NULL leg)', async (db) => {
		const user = await seedUser(db);
		const row = await seedAlert({ userId: user.id, readAt: READ }, db);

		await markAlertRead(db, user.id, row.id, NOW);

		const [after] = await db.select().from(notifications).where(eq(notifications.id, row.id));
		expect(after.readAt).toBe(NOW_RENDER);
	});

	rollbackTest(
		'markAllAlertsRead stamps only the unread rows of the caller; read rows keep their stamp',
		async (db) => {
			const user = await seedUser(db);
			const other = await seedUser(db);
			const first = await seedAlert({ userId: user.id }, db);
			const second = await seedAlert({ userId: user.id }, db);
			const alreadyRead = await seedAlert({ userId: user.id, readAt: READ }, db);
			const foreign = await seedAlert({ userId: other.id }, db);

			await markAllAlertsRead(db, user.id, NOW);

			const readAtOf = async (id: string) =>
				(await db.select().from(notifications).where(eq(notifications.id, id)))[0].readAt;
			expect(await readAtOf(first.id)).toBe(NOW_RENDER);
			expect(await readAtOf(second.id)).toBe(NOW_RENDER);
			expect(await readAtOf(alreadyRead.id)).toBe(alreadyRead.readAt);
			expect(await readAtOf(foreign.id)).toBeNull();
		}
	);

	rollbackTest('deleteReadAlerts removes only the caller read rows and counts them', async (db) => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		const unread = await seedAlert({ userId: user.id }, db);
		await seedAlert({ userId: user.id, readAt: READ }, db);
		await seedAlert({ userId: user.id, readAt: READ }, db);
		const foreign = await seedAlert({ userId: other.id, readAt: READ }, db);

		expect(await deleteReadAlerts(db, user.id)).toBe(2);

		const remaining = await db.select({ id: notifications.id }).from(notifications);
		expect(remaining.map((row) => row.id).sort()).toEqual([unread.id, foreign.id].sort());
	});

	rollbackTest('deleteReadAlerts answers 0 when nothing is read', async (db) => {
		const user = await seedUser(db);
		await seedAlert({ userId: user.id }, db);
		expect(await deleteReadAlerts(db, user.id)).toBe(0);
	});

	rollbackTest(
		'deleteReadAlertsBefore deletes read rows older than the cutoff in every account',
		async (db) => {
			const user = await seedUser(db);
			const other = await seedUser(db);
			await seedAlert({ userId: user.id, readAt: '2026-01-01T00:00:00.000Z' }, db);
			await seedAlert({ userId: other.id, readAt: '2026-01-02T00:00:00.000Z' }, db);
			const recent = await seedAlert({ userId: user.id, readAt: '2026-03-30T00:00:00.000Z' }, db);

			expect(await deleteReadAlertsBefore(db, new Date('2026-02-01T00:00:00Z'))).toBe(2);

			const remaining = await db.select({ id: notifications.id }).from(notifications);
			expect(remaining.map((row) => row.id)).toEqual([recent.id]);
		}
	);

	rollbackTest('deleteReadAlertsBefore never deletes an unread row, however old', async (db) => {
		const user = await seedUser(db);
		const unread = await seedAlert({ userId: user.id, createdAt: '2020-01-01T00:00:00.000Z' }, db);

		expect(await deleteReadAlertsBefore(db, new Date('2026-02-01T00:00:00Z'))).toBe(0);

		const remaining = await db.select({ id: notifications.id }).from(notifications);
		expect(remaining.map((row) => row.id)).toEqual([unread.id]);
	});

	rollbackTest('deleteReadAlertsBefore counts from readAt, not createdAt', async (db) => {
		const user = await seedUser(db);
		// An old Alert read recently stays; a recent Alert read long ago goes.
		const oldButReadRecently = await seedAlert(
			{
				userId: user.id,
				createdAt: '2025-01-01T00:00:00.000Z',
				readAt: '2026-03-30T00:00:00.000Z'
			},
			db
		);
		await seedAlert(
			{
				userId: user.id,
				createdAt: '2026-03-29T00:00:00.000Z',
				readAt: '2026-01-01T00:00:00.000Z'
			},
			db
		);

		expect(await deleteReadAlertsBefore(db, new Date('2026-02-01T00:00:00Z'))).toBe(1);

		const remaining = await db.select({ id: notifications.id }).from(notifications);
		expect(remaining.map((row) => row.id)).toEqual([oldButReadRecently.id]);
	});

	rollbackTest('deleteReadAlertsBefore keeps a row read exactly at the cutoff', async (db) => {
		const user = await seedUser(db);
		const atCutoff = await seedAlert({ userId: user.id, readAt: '2026-02-01T00:00:00.000Z' }, db);

		expect(await deleteReadAlertsBefore(db, new Date('2026-02-01T00:00:00Z'))).toBe(0);

		const remaining = await db.select({ id: notifications.id }).from(notifications);
		expect(remaining.map((row) => row.id)).toEqual([atCutoff.id]);
	});
});

describe('push subscriptions', () => {
	const ENDPOINT = 'https://push.example.test/subscription/1';
	const OTHER_ENDPOINT = 'https://push.example.test/subscription/2';

	rollbackTest('upsertPushSubscription inserts a new endpoint stamped with now', async (db) => {
		const user = await seedUser(db);

		await upsertPushSubscription(
			db,
			user.id,
			{ endpoint: ENDPOINT, keys: { p256dh: 'p-key', auth: 'a-key' } },
			NOW
		);

		const rows = await db.select().from(pushSubscriptions);
		expect(rows.map((row) => [row.userId, row.endpoint, row.p256dh, row.auth, row.createdAt])).toEqual([
			[user.id, ENDPOINT, 'p-key', 'a-key', NOW_RENDER]
		]);
	});

	rollbackTest(
		'upsertPushSubscription re-owns a known endpoint with the new keys and keeps its createdAt',
		async (db) => {
			const first = await seedUser(db);
			const second = await seedUser(db);
			await upsertPushSubscription(
				db,
				first.id,
				{ endpoint: ENDPOINT, keys: { p256dh: 'old-p', auth: 'old-a' } },
				NOW
			);

			await upsertPushSubscription(
				db,
				second.id,
				{ endpoint: ENDPOINT, keys: { p256dh: 'new-p', auth: 'new-a' } },
				new Date('2026-05-01T12:00:00Z')
			);

			const rows = await db.select().from(pushSubscriptions);
			expect(rows.map((row) => [row.userId, row.p256dh, row.auth, row.createdAt])).toEqual([
				[second.id, 'new-p', 'new-a', NOW_RENDER]
			]);
		}
	);

	rollbackTest('deletePushSubscription removes only the caller row for that endpoint', async (db) => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		await seedPushSubscription(user.id, ENDPOINT, {}, db);
		await seedPushSubscription(user.id, OTHER_ENDPOINT, {}, db);
		await seedPushSubscription(other.id, 'https://push.example.test/subscription/3', {}, db);

		await deletePushSubscription(db, user.id, ENDPOINT);

		const rows = await db.select().from(pushSubscriptions);
		expect(rows.map((row) => row.endpoint).sort()).toEqual(
			[OTHER_ENDPOINT, 'https://push.example.test/subscription/3'].sort()
		);
	});

	rollbackTest('deletePushSubscription leaves another persons row for the same endpoint', async (db) => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		await seedPushSubscription(other.id, ENDPOINT, {}, db);

		await deletePushSubscription(db, user.id, ENDPOINT);

		const rows = await db.select().from(pushSubscriptions);
		expect(rows.map((row) => row.userId)).toEqual([other.id]);
	});

	rollbackTest('listPushSubscriptions answers only that user subscriptions', async (db) => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		await seedPushSubscription(user.id, ENDPOINT, {}, db);
		await seedPushSubscription(user.id, OTHER_ENDPOINT, {}, db);
		await seedPushSubscription(other.id, 'https://push.example.test/subscription/3', {}, db);

		const rows = await listPushSubscriptions(db, user.id);
		expect(rows.map((row) => row.endpoint).sort()).toEqual([ENDPOINT, OTHER_ENDPOINT].sort());
		expect(await listPushSubscriptions(db, 'nobody')).toEqual([]);
	});
});

describe('device tokens', () => {
	rollbackTest('upsertDeviceToken inserts a new token stamped with now', async (db) => {
		const user = await seedUser(db);

		await upsertDeviceToken(db, user.id, 'token-1', 'android', NOW);

		const [row] = await db.select().from(deviceTokens);
		expect([row.userId, row.token, row.platform]).toEqual([user.id, 'token-1', 'android']);
		expect(row.createdAt.getTime()).toBe(NOW.getTime());
		expect(row.lastSeenAt.getTime()).toBe(NOW.getTime());
	});

	rollbackTest(
		'upsertDeviceToken re-owns a known token and refreshes lastSeenAt but not createdAt',
		async (db) => {
			const first = await seedUser(db);
			const second = await seedUser(db);
			const later = new Date('2026-05-01T12:00:00Z');
			await upsertDeviceToken(db, first.id, 'token-1', 'android', NOW);

			await upsertDeviceToken(db, second.id, 'token-1', 'android', later);

			const rows = await db.select().from(deviceTokens);
			expect(rows).toHaveLength(1);
			expect(rows[0].userId).toBe(second.id);
			expect(rows[0].createdAt.getTime()).toBe(NOW.getTime());
			expect(rows[0].lastSeenAt.getTime()).toBe(later.getTime());
		}
	);

	rollbackTest('deleteDeviceToken removes only the caller row for that token', async (db) => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		await seedDeviceToken(user.id, 'token-1', {}, db);
		await seedDeviceToken(user.id, 'token-2', {}, db);
		await seedDeviceToken(other.id, 'token-3', {}, db);

		await deleteDeviceToken(db, user.id, 'token-1');

		const rows = await db.select().from(deviceTokens);
		expect(rows.map((row) => row.token).sort()).toEqual(['token-2', 'token-3']);
	});

	rollbackTest('deleteDeviceToken leaves another persons row for the same token', async (db) => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		await seedDeviceToken(other.id, 'token-1', {}, db);

		await deleteDeviceToken(db, user.id, 'token-1');

		const rows = await db.select().from(deviceTokens);
		expect(rows.map((row) => row.userId)).toEqual([other.id]);
	});

	rollbackTest('deleteDeadDeviceToken removes the token whoever holds it, and only it', async (db) => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		await seedDeviceToken(user.id, 'dead', {}, db);
		await seedDeviceToken(other.id, 'alive', {}, db);

		await deleteDeadDeviceToken(db, 'dead');

		const rows = await db.select().from(deviceTokens);
		expect(rows.map((row) => row.token)).toEqual(['alive']);
	});

	rollbackTest('listDeviceTokens answers the tokens of the given users only', async (db) => {
		const first = await seedUser(db);
		const second = await seedUser(db);
		const third = await seedUser(db);
		await seedDeviceToken(first.id, 'a', {}, db);
		await seedDeviceToken(first.id, 'b', {}, db);
		await seedDeviceToken(second.id, 'c', {}, db);
		await seedDeviceToken(third.id, 'd', {}, db);

		const rows = await listDeviceTokens(db, [first.id, second.id]);
		expect(rows.map((row) => [row.userId, row.token]).sort()).toEqual(
			[
				[first.id, 'a'],
				[first.id, 'b'],
				[second.id, 'c']
			].sort()
		);
	});

	rollbackTest('listDeviceTokens answers nothing, without a query, for no users', async (db) => {
		const user = await seedUser(db);
		await seedDeviceToken(user.id, 'a', {}, db);
		expect(await listDeviceTokens(db, [])).toEqual([]);
	});
});

describe('the preference row', () => {
	const PREFERENCES = {
		taskAssigned: false,
		taskCompleted: true,
		familyJoined: false,
		aiSuggestions: true
	};

	rollbackTest('findAlertPreferencesRow answers null when the user has no row', async (db) => {
		const user = await seedUser(db);
		expect(await findAlertPreferencesRow(db, user.id, NOW)).toBeNull();
	});

	rollbackTest('findAlertPreferencesRow reads a tierless row without a plan', async (db) => {
		const user = await seedUser(db);
		const id = await seedAlertPreferencesRow(user.id, { email: false, sms: false, preferences: PREFERENCES }, {}, db);

		expect(await findAlertPreferencesRow(db, user.id, NOW)).toEqual({
			id,
			notificationMethods: { email: false, sms: false, preferences: PREFERENCES }
		});
	});

	rollbackTest('findAlertPreferencesRow picks the newest unexpired row', async (db) => {
		const user = await seedUser(db);
		await seedAlertPreferencesRow(
			user.id,
			{ email: true, sms: true },
			{ createdAt: new Date('2026-01-01T00:00:00Z') },
			db
		);
		const newest = await seedAlertPreferencesRow(
			user.id,
			{ email: false, sms: false, preferences: PREFERENCES },
			{ createdAt: new Date('2026-02-01T00:00:00Z') },
			db
		);

		const row = await findAlertPreferencesRow(db, user.id, NOW);
		expect(row?.id).toBe(newest);
	});

	rollbackTest('findAlertPreferencesRow skips an expired newest row for an older live one', async (db) => {
		const user = await seedUser(db);
		const live = await seedAlertPreferencesRow(
			user.id,
			{ email: true, sms: true },
			{ createdAt: new Date('2026-01-01T00:00:00Z') },
			db
		);
		await seedAlertPreferencesRow(
			user.id,
			{ email: false, sms: false, preferences: PREFERENCES },
			{ createdAt: new Date('2026-02-01T00:00:00Z'), endDate: new Date('2026-03-01T00:00:00Z') },
			db
		);

		const row = await findAlertPreferencesRow(db, user.id, NOW);
		expect(row?.id).toBe(live);
	});

	rollbackTest('findAlertPreferencesRow treats a row ending exactly now as expired', async (db) => {
		const user = await seedUser(db);
		await seedAlertPreferencesRow(user.id, { email: true, sms: true }, { endDate: NOW }, db);

		expect(await findAlertPreferencesRow(db, user.id, NOW)).toBeNull();
	});

	rollbackTest('findAlertPreferencesRow ignores another persons row', async (db) => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		await seedAlertPreferencesRow(other.id, { email: true, sms: true }, {}, db);

		expect(await findAlertPreferencesRow(db, user.id, NOW)).toBeNull();
	});

	rollbackTest('insertAlertPreferencesRow creates the tierless, far-future row stamped now', async (db) => {
		const user = await seedUser(db);

		await insertAlertPreferencesRow(
			db,
			user.id,
			{ email: false, sms: false, preferences: PREFERENCES },
			NOW
		);

		const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
		expect(row.subscriptionTypeId).toBeNull();
		expect(row.endDate.toISOString()).toBe('9999-12-31T00:00:00.000Z');
		expect(row.startDate.getTime()).toBe(NOW.getTime());
		expect(row.createdAt.getTime()).toBe(NOW.getTime());
		expect(row.updatedAt.getTime()).toBe(NOW.getTime());
		expect(row.notificationMethods).toEqual({ email: false, sms: false, preferences: PREFERENCES });
	});

	rollbackTest(
		'updateAlertPreferencesRow replaces the methods and stamps updatedAt with now, only on that row',
		async (db) => {
			const user = await seedUser(db);
			const created = new Date('2026-01-01T00:00:00Z');
			const id = await seedAlertPreferencesRow(
				user.id,
				{ email: true, sms: true },
				{ createdAt: created, updatedAt: created },
				db
			);
			const other = await seedUser(db);
			const otherId = await seedAlertPreferencesRow(
				other.id,
				{ email: true, sms: false },
				{ createdAt: created, updatedAt: created },
				db
			);

			await updateAlertPreferencesRow(
				db,
				id,
				{ email: true, sms: true, preferences: PREFERENCES },
				NOW
			);

			const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, id));
			expect(row.notificationMethods).toEqual({ email: true, sms: true, preferences: PREFERENCES });
			expect(row.updatedAt.getTime()).toBe(NOW.getTime());
			expect(row.createdAt.getTime()).toBe(created.getTime());
			const [untouched] = await db.select().from(subscriptions).where(eq(subscriptions.id, otherId));
			expect(untouched.notificationMethods).toEqual({ email: true, sms: false });
			expect(untouched.updatedAt.getTime()).toBe(created.getTime());
		}
	);
});
