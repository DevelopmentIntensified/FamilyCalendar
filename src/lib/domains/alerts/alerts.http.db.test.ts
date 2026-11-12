/**
 * alerts — golden contract tests for this module's /api routes, written
 * against the legacy handlers and unchanged after the port (S6).
 *
 * Two routes are spec goldens: their legacy handlers import accountData ->
 * `$lib/utils/sendEmail` -> `$env/static/private`, which the db project does
 * not provide (characterize-endpoints.md gotcha). They load dynamically so
 * today's import failure skips them instead of failing the file; once the port
 * removes that import they load and run unedited.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	deviceTokens,
	notifications,
	pushSubscriptions,
	subscriptions
} from '$lib/kernel/db/tables.server';
import { invoke } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
import type { JsonValue } from '$lib/kernel/validation/validators';
import { DELETE as deleteDevice, POST as postDevice } from '../../../routes/api/devices/+server';
import {
	GET as getNotifications,
	POST as postNotifications
} from '../../../routes/api/notifications/+server';
import { GET as getPushPublicKey } from '../../../routes/api/push/public-key/+server';
import { POST as postPushSubscribe } from '../../../routes/api/push/subscribe/+server';
import { POST as postPushUnsubscribe } from '../../../routes/api/push/unsubscribe/+server';

const ctx = () => testCtx({ db: testDb() });

type AlertInsert = typeof notifications.$inferInsert;
type AlertRow = typeof notifications.$inferSelect;
type SubscriptionMethods = typeof subscriptions.$inferInsert.notificationMethods;
/** A refused input: a parsed body, or raw text for unparseable JSON. */
type BadBody = { label: string; body?: JsonValue; raw?: string };

const TOKEN = `fcm-${'x'.repeat(40)}`;
const ENDPOINT = 'https://push.example.test/subscription/1';

beforeEach(truncateAll);

async function seedAlert(overrides: Partial<AlertInsert> & { userId: string }): Promise<AlertRow> {
	const [row] = await testDb()
		.insert(notifications)
		.values({
			type: 'task_completed',
			actorName: 'Sam',
			message: 'completed the bins',
			...overrides
		})
		.returning();
	return row;
}

async function readAlerts(userId: string): Promise<AlertRow[]> {
	return testDb().select().from(notifications).where(eq(notifications.userId, userId));
}

async function seedDeviceToken(userId: string, token: string): Promise<void> {
	await testDb().insert(deviceTokens).values({ userId, token });
}

async function seedSubscription(
	userId: string,
	notificationMethods: SubscriptionMethods,
	overrides: Partial<typeof subscriptions.$inferInsert> = {}
): Promise<void> {
	await testDb()
		.insert(subscriptions)
		.values({
			userId,
			notificationMethods,
			subscriptionTypeId: null,
			endDate: new Date('9999-12-31T00:00:00.000Z'),
			...overrides
		});
}

/** The four switches exactly as the account page declares them. */
const PREFERENCE_OPTIONS = [
	{ id: 'taskAssigned', label: 'Task assigned to me', hint: 'In-app and push', default: true },
	{ id: 'taskCompleted', label: 'Task completed', hint: 'In-app and push', default: true },
	{
		id: 'familyJoined',
		label: 'Someone joined the family',
		hint: 'In-app only',
		default: false
	},
	{ id: 'aiSuggestions', label: 'AI event suggestions', hint: 'Uses your AI allowance', default: true }
];

const DEFAULT_PREFERENCES = {
	taskAssigned: true,
	taskCompleted: true,
	familyJoined: false,
	aiSuggestions: true
};

describe('GET /api/notifications', () => {
	it('answers the caller feed newest first, guarded, with the unread count', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		const completed = await seedAlert({
			userId: user.id,
			type: 'task_completed',
			actorName: 'Sam',
			message: 'completed "Bins"',
			link: '/calendar/tasks',
			createdAt: '2026-03-01T09:00:00.000Z'
		});
		const declined = await seedAlert({
			userId: user.id,
			type: 'assignment_declined',
			actorName: 'Kim',
			message: 'declined "Hoover"',
			link: null,
			readAt: '2026-03-02T11:00:00.000Z',
			createdAt: '2026-03-02T10:00:00.000Z'
		});
		const unknown = await seedAlert({
			userId: user.id,
			type: 'mystery_type',
			actorName: 'Alex',
			message: 'did something',
			link: null,
			createdAt: '2026-03-03T10:00:00.000Z'
		});
		const pending = await seedAlert({
			userId: user.id,
			type: 'assignment_pending',
			actorName: 'Kim',
			message: 'asked you to take "Bins"',
			link: '/calendar/tasks',
			createdAt: '2026-03-04T10:00:00.000Z'
		});
		await seedAlert({ userId: other.id, createdAt: '2026-03-05T10:00:00.000Z' });

		const res = await invoke(getNotifications, {
			ctx: ctx(),
			user,
			path: '/api/notifications'
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			notifications: [
				{
					id: pending.id,
					type: 'assignment_pending',
					rawType: 'assignment_pending',
					group: 'needs_you',
					actorName: 'Kim',
					message: 'asked you to take "Bins"',
					link: '/calendar/tasks',
					readAt: null,
					createdAt: pending.createdAt
				},
				{
					id: unknown.id,
					type: null,
					rawType: 'mystery_type',
					group: 'news',
					actorName: 'Alex',
					message: 'did something',
					link: null,
					readAt: null,
					createdAt: unknown.createdAt
				},
				{
					id: declined.id,
					type: 'assignment_declined',
					rawType: 'assignment_declined',
					group: 'needs_you',
					actorName: 'Kim',
					message: 'declined "Hoover"',
					link: null,
					readAt: declined.readAt,
					createdAt: declined.createdAt
				},
				{
					id: completed.id,
					type: 'task_completed',
					rawType: 'task_completed',
					group: 'news',
					actorName: 'Sam',
					message: 'completed "Bins"',
					link: '/calendar/tasks',
					readAt: null,
					createdAt: completed.createdAt
				}
			],
			unreadCount: 3
		});
	});

	it('reads at most the 50 newest rows while counting every unread', async () => {
		const user = await seedUser(testDb());
		const seeded = await testDb()
			.insert(notifications)
			.values(
				Array.from({ length: 51 }, (_, index) => ({
					userId: user.id,
					type: 'task_completed',
					actorName: 'Sam',
					message: `alert-${index}`,
					createdAt: new Date(Date.UTC(2026, 2, 1, 0, index)).toISOString()
				}))
			)
			.returning();

		const res = await invoke(getNotifications, { ctx: ctx(), user, path: '/api/notifications' });

		expect(res.status).toBe(200);
		const body = res.body as { notifications: { id: string; message: string }[]; unreadCount: number };
		expect(body.notifications).toHaveLength(50);
		expect(body.notifications[0].message).toBe('alert-50');
		expect(body.notifications[49].message).toBe('alert-1');
		expect(body.notifications.map((row) => row.id)).not.toContain(seeded[0].id);
		expect(body.unreadCount).toBe(51);
	});

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(getNotifications, { ctx: ctx(), path: '/api/notifications' });
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});
});

describe('POST /api/notifications', () => {
	it('marks every unread row read, scoped to the caller', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		const first = await seedAlert({ userId: user.id });
		const second = await seedAlert({ userId: user.id });
		const alreadyRead = await seedAlert({
			userId: user.id,
			readAt: '2026-03-02T11:00:00.000Z'
		});
		const foreign = await seedAlert({ userId: other.id });

		const res = await invoke(postNotifications, {
			ctx: ctx(),
			user,
			path: '/api/notifications',
			body: { all: true }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		const rows = new Map((await readAlerts(user.id)).map((row) => [row.id, row]));
		expect(rows.get(first.id)?.readAt).not.toBeNull();
		expect(rows.get(second.id)?.readAt).not.toBeNull();
		expect(rows.get(alreadyRead.id)?.readAt).toBe(alreadyRead.readAt);
		const [foreignAfter] = await readAlerts(other.id);
		expect(foreignAfter.id).toBe(foreign.id);
		expect(foreignAfter.readAt).toBeNull();
	});

	it('marks one row read, scoped to the caller', async () => {
		const user = await seedUser(testDb());
		const first = await seedAlert({ userId: user.id });
		const second = await seedAlert({ userId: user.id, createdAt: '2026-03-02T10:00:00.000Z' });

		const res = await invoke(postNotifications, {
			ctx: ctx(),
			user,
			path: '/api/notifications',
			body: { id: second.id }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		const rows = new Map((await readAlerts(user.id)).map((row) => [row.id, row]));
		expect(rows.get(second.id)?.readAt).not.toBeNull();
		expect(rows.get(first.id)?.readAt).toBeNull();
	});

	it('is visible in the next GET: the row is read and the unread count drops', async () => {
		const user = await seedUser(testDb());
		const first = await seedAlert({ userId: user.id, createdAt: '2026-03-01T09:00:00.000Z' });
		const second = await seedAlert({ userId: user.id, createdAt: '2026-03-02T09:00:00.000Z' });

		await invoke(postNotifications, {
			ctx: ctx(),
			user,
			path: '/api/notifications',
			body: { id: second.id }
		});
		const res = await invoke(getNotifications, { ctx: ctx(), user, path: '/api/notifications' });

		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({
			unreadCount: 1,
			notifications: expect.arrayContaining([
				expect.objectContaining({ id: second.id, readAt: expect.any(String) }),
				expect.objectContaining({ id: first.id, readAt: null })
			])
		});
	});

	it('answers {success:true} for an unknown id and changes nothing', async () => {
		const user = await seedUser(testDb());
		const row = await seedAlert({ userId: user.id });

		const res = await invoke(postNotifications, {
			ctx: ctx(),
			user,
			path: '/api/notifications',
			body: { id: 'no-such-alert' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		const [after] = await readAlerts(user.id);
		expect(after.id).toBe(row.id);
		expect(after.readAt).toBeNull();
	});

	it('does not mark another persons row read', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		const foreign = await seedAlert({ userId: other.id });

		const res = await invoke(postNotifications, {
			ctx: ctx(),
			user,
			path: '/api/notifications',
			body: { id: foreign.id }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		const [after] = await readAlerts(other.id);
		expect(after.readAt).toBeNull();
	});

	it('prunes only the caller read rows and returns the count', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		const unread = await seedAlert({ userId: user.id });
		await seedAlert({ userId: user.id, readAt: '2026-03-02T11:00:00.000Z' });
		await seedAlert({ userId: other.id, readAt: '2026-03-02T11:00:00.000Z' });

		const res = await invoke(postNotifications, {
			ctx: ctx(),
			user,
			path: '/api/notifications',
			body: { pruneRead: true }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true, removed: 1 });
		const mine = await readAlerts(user.id);
		expect(mine.map((row) => row.id)).toEqual([unread.id]);
		expect(await readAlerts(other.id)).toHaveLength(1);
	});

	it('answers {success:true, removed:0} when nothing is read', async () => {
		const user = await seedUser(testDb());
		await seedAlert({ userId: user.id });

		const res = await invoke(postNotifications, {
			ctx: ctx(),
			user,
			path: '/api/notifications',
			body: { pruneRead: true }
		});

		expect(res).toMatchObject({ status: 200, body: { success: true, removed: 0 } });
	});

	it('lets {all:true} win over {pruneRead:true}', async () => {
		const user = await seedUser(testDb());
		await seedAlert({ userId: user.id });

		const res = await invoke(postNotifications, {
			ctx: ctx(),
			user,
			path: '/api/notifications',
			body: { all: true, pruneRead: true }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		const rows = await readAlerts(user.id);
		expect(rows).toHaveLength(1);
		expect(rows[0].readAt).not.toBeNull();
	});

	const invalidBodies: BadBody[] = [
		{ label: 'an array body', body: [] },
		{ label: 'a string body', body: 'tasks' },
		{ label: 'a null body', body: null },
		{ label: 'malformed JSON', raw: '{' },
		{ label: 'an empty body', raw: '' }
	];
	it.each(invalidBodies)(
		'answers 400 {"error":"Invalid request body"} for $label',
		async ({ body, raw }) => {
			const user = await seedUser(testDb());
			const res = await invoke(postNotifications, {
				ctx: ctx(),
				user,
				path: '/api/notifications',
				...(raw === undefined ? { body } : { rawBody: raw })
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'Invalid request body' });
		}
	);

	it.each([
		{ label: 'no action at all', body: {} },
		{ label: 'an empty id', body: { id: '' } },
		{ label: 'a non-string id', body: { id: 42 } },
		{ label: 'a null id', body: { id: null } },
		{ label: 'all as a string', body: { all: 'true' } },
		{ label: 'pruneRead as a string', body: { pruneRead: 'yes' } }
	])('answers 400 {"error":"Notification id is required"} for $label', async ({ body }) => {
		const user = await seedUser(testDb());
		const res = await invoke(postNotifications, {
			ctx: ctx(),
			user,
			path: '/api/notifications',
			body
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Notification id is required' });
	});

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(postNotifications, {
			ctx: ctx(),
			path: '/api/notifications',
			body: { all: true }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});
});

describe('POST /api/devices', () => {
	it('registers the caller token and answers {success:true}', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(postDevice, {
			ctx: ctx(),
			user,
			path: '/api/devices',
			body: { token: TOKEN, platform: 'android' }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		const rows = await testDb().select().from(deviceTokens).where(eq(deviceTokens.token, TOKEN));
		expect(rows.map((row) => [row.userId, row.token, row.platform])).toEqual([
			[user.id, TOKEN, 'android']
		]);
	});

	it('defaults the platform to android when it is absent', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(postDevice, {
			ctx: ctx(),
			user,
			path: '/api/devices',
			body: { token: TOKEN }
		});

		expect(res.status).toBe(200);
		const [row] = await testDb().select().from(deviceTokens).where(eq(deviceTokens.token, TOKEN));
		expect(row.platform).toBe('android');
	});

	it('trims the token before the emptiness and length checks', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(postDevice, {
			ctx: ctx(),
			user,
			path: '/api/devices',
			body: { token: `  ${' '.repeat(5000)}abc\n` }
		});

		expect(res.status).toBe(200);
		const rows = await testDb().select().from(deviceTokens);
		expect(rows.map((row) => row.token)).toEqual(['abc']);
	});

	it('re-owns a token registered by another account', async () => {
		const first = await seedUser(testDb());
		const second = await seedUser(testDb());
		await invoke(postDevice, {
			ctx: ctx(),
			user: first,
			path: '/api/devices',
			body: { token: TOKEN }
		});
		await invoke(postDevice, {
			ctx: ctx(),
			user: second,
			path: '/api/devices',
			body: { token: TOKEN }
		});

		const rows = await testDb().select().from(deviceTokens).where(eq(deviceTokens.token, TOKEN));
		expect(rows).toHaveLength(1);
		expect(rows[0].userId).toBe(second.id);
	});

	it('accepts a Bearer (fp_) caller', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(postDevice, {
			ctx: ctx(),
			user,
			via: 'token',
			path: '/api/devices',
			body: { token: TOKEN }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
	});

	const badBodies: BadBody[] = [
		{ label: 'a missing token', body: {} },
		{ label: 'an empty token', body: { token: '' } },
		{ label: 'a blank token', body: { token: '   ' } },
		{ label: 'a non-string token', body: { token: 42 } },
		{ label: 'a null token', body: { token: null } },
		{ label: 'a non-object body', body: 'token' },
		{ label: 'a null body', body: null },
		{ label: 'malformed JSON', raw: '{' }
	];
	it.each(badBodies)(
		'answers 400 {"error":"token is required"} for $label',
		async ({ body, raw }) => {
			const user = await seedUser(testDb());
			const res = await invoke(postDevice, {
				ctx: ctx(),
				user,
				path: '/api/devices',
				...(raw === undefined ? { body } : { rawBody: raw })
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'token is required' });
		}
	);

	it('accepts a token of exactly 4096 characters and refuses 4097', async () => {
		const user = await seedUser(testDb());
		const accepted = await invoke(postDevice, {
			ctx: ctx(),
			user,
			path: '/api/devices',
			body: { token: 'x'.repeat(4096) }
		});
		expect(accepted.status).toBe(200);

		const refused = await invoke(postDevice, {
			ctx: ctx(),
			user,
			path: '/api/devices',
			body: { token: 'x'.repeat(4097) }
		});
		expect(refused.status).toBe(400);
		expect(refused.body).toEqual({ error: 'token is too long' });
	});

	it.each([
		{ label: 'an ios platform', platform: 'ios' },
		{ label: 'a null platform', platform: null },
		{ label: 'a case-variant platform', platform: 'ANDROID' }
	])('answers 400 {"error":"platform must be \'android\'"} for $label', async ({ platform }) => {
		const user = await seedUser(testDb());
		const res = await invoke(postDevice, {
			ctx: ctx(),
			user,
			path: '/api/devices',
			body: { token: TOKEN, platform }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: "platform must be 'android'" });
	});

	it('answers 401 {"error":"Unauthorized"} when signed out, before reading the body', async () => {
		const res = await invoke(postDevice, {
			ctx: ctx(),
			path: '/api/devices',
			rawBody: 'not json'
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});
});

describe('DELETE /api/devices', () => {
	it('removes only the caller row and answers {success:true}', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		const otherToken = `fcm-${'y'.repeat(40)}`;
		await seedDeviceToken(user.id, TOKEN);
		await seedDeviceToken(other.id, otherToken);

		const res = await invoke(deleteDevice, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			path: '/api/devices',
			body: { token: TOKEN }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		const rows = await testDb().select().from(deviceTokens);
		expect(rows.map((row) => [row.userId, row.token])).toEqual([[other.id, otherToken]]);
	});

	it('answers {success:true} when the caller has no such row', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		await seedDeviceToken(other.id, TOKEN);

		const res = await invoke(deleteDevice, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			path: '/api/devices',
			body: { token: TOKEN }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		expect(await testDb().select().from(deviceTokens)).toHaveLength(1);
	});

	it('validates the platform even though DELETE ignores it', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(deleteDevice, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			path: '/api/devices',
			body: { token: TOKEN, platform: 'ios' }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: "platform must be 'android'" });
	});

	it.each([
		{ label: 'a missing token', body: {}, error: 'token is required' },
		{
			label: 'a token over 4096 characters',
			body: { token: 'x'.repeat(4097) },
			error: 'token is too long'
		}
	])('answers 400 for $label', async ({ body, error }) => {
		const user = await seedUser(testDb());
		const res = await invoke(deleteDevice, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			path: '/api/devices',
			body
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error });
	});

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(deleteDevice, {
			ctx: ctx(),
			method: 'DELETE',
			path: '/api/devices',
			body: { token: TOKEN }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});
});

describe('GET /api/push/public-key', () => {
	let savedKey: string | undefined;

	beforeEach(() => {
		savedKey = process.env.VAPID_PUBLIC_KEY;
		delete process.env.VAPID_PUBLIC_KEY;
	});

	afterEach(() => {
		if (savedKey === undefined) delete process.env.VAPID_PUBLIC_KEY;
		else process.env.VAPID_PUBLIC_KEY = savedKey;
	});

	it('answers {publicKey:null} when VAPID_PUBLIC_KEY is unset', async () => {
		const res = await invoke(getPushPublicKey, { ctx: ctx(), path: '/api/push/public-key' });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ publicKey: null });
	});

	it('answers the configured key', async () => {
		process.env.VAPID_PUBLIC_KEY = 'BPublicKeyForTests';
		const res = await invoke(getPushPublicKey, { ctx: ctx(), path: '/api/push/public-key' });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ publicKey: 'BPublicKeyForTests' });
	});
});

describe('POST /api/push/subscribe', () => {
	const validBody = {
		endpoint: ENDPOINT,
		keys: { p256dh: 'p256dh-key', auth: 'auth-key' }
	};

	it('stores the subscription and answers {success:true}', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(postPushSubscribe, {
			ctx: ctx(),
			user,
			path: '/api/push/subscribe',
			body: validBody
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		const rows = await testDb().select().from(pushSubscriptions);
		expect(rows.map((row) => [row.userId, row.endpoint, row.p256dh, row.auth])).toEqual([
			[user.id, ENDPOINT, 'p256dh-key', 'auth-key']
		]);
	});

	it('upserts by endpoint, re-owning it to the caller', async () => {
		const first = await seedUser(testDb());
		const second = await seedUser(testDb());
		await invoke(postPushSubscribe, {
			ctx: ctx(),
			user: first,
			path: '/api/push/subscribe',
			body: validBody
		});
		await invoke(postPushSubscribe, {
			ctx: ctx(),
			user: second,
			path: '/api/push/subscribe',
			body: { endpoint: ENDPOINT, keys: { p256dh: 'new-p256dh', auth: 'new-auth' } }
		});

		const rows = await testDb()
			.select()
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.endpoint, ENDPOINT));
		expect(rows).toHaveLength(1);
		expect(rows.map((row) => [row.userId, row.p256dh, row.auth])).toEqual([
			[second.id, 'new-p256dh', 'new-auth']
		]);
	});

	const badBodies: BadBody[] = [
		{ label: 'an empty body', body: {} },
		{ label: 'a missing keys object', body: { endpoint: ENDPOINT } },
		{ label: 'an empty endpoint', body: { endpoint: '', keys: validBody.keys } },
		{ label: 'a non-string endpoint', body: { endpoint: 42, keys: validBody.keys } },
		{ label: 'an empty keys object', body: { endpoint: ENDPOINT, keys: {} } },
		{ label: 'a missing auth key', body: { endpoint: ENDPOINT, keys: { p256dh: 'k' } } },
		{ label: 'an empty p256dh', body: { endpoint: ENDPOINT, keys: { p256dh: '', auth: 'a' } } },
		{ label: 'a null keys object', body: { endpoint: ENDPOINT, keys: null } },
		{ label: 'a non-object body', body: 'subscription' },
		{ label: 'a null body', body: null },
		{ label: 'malformed JSON', raw: '{' }
	];
	it.each(badBodies)(
		'answers 400 {"error":"Invalid subscription payload"} for $label',
		async ({ body, raw }) => {
			const user = await seedUser(testDb());
			const res = await invoke(postPushSubscribe, {
				ctx: ctx(),
				user,
				path: '/api/push/subscribe',
				...(raw === undefined ? { body } : { rawBody: raw })
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'Invalid subscription payload' });
			expect(await testDb().select().from(pushSubscriptions)).toHaveLength(0);
		}
	);

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(postPushSubscribe, {
			ctx: ctx(),
			path: '/api/push/subscribe',
			body: validBody
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});
});

describe('POST /api/push/unsubscribe', () => {
	it('removes only the caller subscription for that endpoint', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		const otherEndpoint = 'https://push.example.test/subscription/2';
		await testDb().insert(pushSubscriptions).values([
			{ userId: user.id, endpoint: ENDPOINT, p256dh: 'p', auth: 'a' },
			{ userId: other.id, endpoint: otherEndpoint, p256dh: 'p', auth: 'a' }
		]);

		const res = await invoke(postPushUnsubscribe, {
			ctx: ctx(),
			user,
			path: '/api/push/unsubscribe',
			body: { endpoint: ENDPOINT }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		const rows = await testDb().select().from(pushSubscriptions);
		expect(rows.map((row) => [row.userId, row.endpoint])).toEqual([[other.id, otherEndpoint]]);
	});

	it('answers {success:true} for an endpoint the caller never saved', async () => {
		const user = await seedUser(testDb());
		const other = await seedUser(testDb());
		await testDb()
			.insert(pushSubscriptions)
			.values({ userId: other.id, endpoint: ENDPOINT, p256dh: 'p', auth: 'a' });

		const res = await invoke(postPushUnsubscribe, {
			ctx: ctx(),
			user,
			path: '/api/push/unsubscribe',
			body: { endpoint: ENDPOINT }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		expect(await testDb().select().from(pushSubscriptions)).toHaveLength(1);
	});

	const badBodies: BadBody[] = [
		{ label: 'an empty body', body: {} },
		{ label: 'an empty endpoint', body: { endpoint: '' } },
		{ label: 'a non-string endpoint', body: { endpoint: 42 } },
		{ label: 'a null endpoint', body: { endpoint: null } },
		{ label: 'a non-object body', body: 'endpoint' },
		{ label: 'a null body', body: null },
		{ label: 'malformed JSON', raw: '{' }
	];
	it.each(badBodies)(
		'answers 400 {"error":"Invalid request body"} for $label',
		async ({ body, raw }) => {
			const user = await seedUser(testDb());
			const res = await invoke(postPushUnsubscribe, {
				ctx: ctx(),
				user,
				path: '/api/push/unsubscribe',
				...(raw === undefined ? { body } : { rawBody: raw })
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'Invalid request body' });
		}
	);

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(postPushUnsubscribe, {
			ctx: ctx(),
			path: '/api/push/unsubscribe',
			body: { endpoint: ENDPOINT }
		});
		expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
	});
});

/**
 * The preferences routes import accountData -> sendEmail -> `$env/static/private`,
 * so the legacy modules cannot load in the db project. These goldens come from
 * task-api-spec.md's account table, the legacy route unit tests and the
 * preferences/notificationMethods code; they run unedited once the port's
 * wiring-only route drops that import.
 *
 * Dynamic import on purpose: a static one would fail this whole file's module
 * graph at S2, before the port removes the `$env` import. The import is a test
 * of a module-loading boundary, the one case a runtime import is correct.
 */
const preferencesRoute = await import(
	'../../../routes/api/me/notification-preferences/+server'
).catch(() => null);
const preferenceRoute = await import(
	'../../../routes/api/me/notification-preferences/[id]/+server'
).catch(() => null);

describe.skipIf(!preferencesRoute)(
	// golden from spec: legacy handler not runnable here (imports accountData -> $lib/utils/sendEmail -> $env/static/private, absent in the db project)
	'GET /api/me/notification-preferences',
	() => {
		it('answers the four defaults for an account with no subscription row, and writes nothing', async () => {
			if (!preferencesRoute) throw new Error('preferences route did not load');
			const user = await seedUser(testDb());

			const res = await invoke(preferencesRoute.GET, {
				ctx: ctx(),
				user,
				path: '/api/me/notification-preferences'
			});

			expect(res.status).toBe(200);
			expect(res.body).toEqual({
				preferences: DEFAULT_PREFERENCES,
				options: PREFERENCE_OPTIONS
			});
			expect(await testDb().select().from(subscriptions)).toHaveLength(0);
		});

		it('reads the stored switches of the newest unexpired row', async () => {
			if (!preferencesRoute) throw new Error('preferences route did not load');
			const user = await seedUser(testDb());
			await seedSubscription(
				user.id,
				{
					email: true,
					sms: true,
					preferences: {
						taskAssigned: false,
						taskCompleted: false,
						familyJoined: true,
						aiSuggestions: false
					}
				},
				{ createdAt: new Date('2026-01-01T00:00:00.000Z') }
			);
			await seedSubscription(
				user.id,
				{
					email: false,
					sms: false,
					preferences: {
						taskAssigned: false,
						taskCompleted: true,
						familyJoined: false,
						aiSuggestions: false
					}
				},
				{ createdAt: new Date('2026-02-01T00:00:00.000Z') }
			);

			const res = await invoke(preferencesRoute.GET, {
				ctx: ctx(),
				user,
				path: '/api/me/notification-preferences'
			});

			expect(res.status).toBe(200);
			expect(res.body).toEqual({
				preferences: {
					taskAssigned: false,
					taskCompleted: true,
					familyJoined: false,
					aiSuggestions: false
				},
				options: PREFERENCE_OPTIONS
			});
		});

		it('ignores an expired row and falls back to the defaults', async () => {
			if (!preferencesRoute) throw new Error('preferences route did not load');
			const user = await seedUser(testDb());
			await seedSubscription(
				user.id,
				{
					email: true,
					sms: true,
					preferences: {
						taskAssigned: false,
						taskCompleted: false,
						familyJoined: true,
						aiSuggestions: false
					}
				},
				{ endDate: new Date('2020-01-01T00:00:00.000Z') }
			);

			const res = await invoke(preferencesRoute.GET, {
				ctx: ctx(),
				user,
				path: '/api/me/notification-preferences'
			});

			expect(res.status).toBe(200);
			expect(res.body).toEqual({
				preferences: DEFAULT_PREFERENCES,
				options: PREFERENCE_OPTIONS
			});
		});

		it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
			if (!preferencesRoute) throw new Error('preferences route did not load');
			const res = await invoke(preferencesRoute.GET, {
				ctx: ctx(),
				path: '/api/me/notification-preferences'
			});
			expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
		});
	}
);

describe.skipIf(!preferenceRoute)(
	// golden from spec: legacy handler not runnable here (imports accountData -> $lib/utils/sendEmail -> $env/static/private, absent in the db project)
	'PUT /api/me/notification-preferences/[id]',
	() => {
		it('saves one switch and answers the receipt', async () => {
			if (!preferenceRoute) throw new Error('preference route did not load');
			const user = await seedUser(testDb());

			const res = await invoke(preferenceRoute.PUT, {
				ctx: ctx(),
				user,
				method: 'PUT',
				path: '/api/me/notification-preferences/taskAssigned',
				params: { id: 'taskAssigned' },
				body: { value: true }
			});

			expect(res.status).toBe(200);
			expect(res.body).toEqual({
				success: true,
				message: 'Task assigned to me alerts are on. Saved.'
			});
		});

		it('keeps the legacy {email,sms} half of the row untouched', async () => {
			if (!preferenceRoute) throw new Error('preference route did not load');
			const user = await seedUser(testDb());
			await seedSubscription(user.id, { email: true, sms: true });

			const res = await invoke(preferenceRoute.PUT, {
				ctx: ctx(),
				user,
				method: 'PUT',
				path: '/api/me/notification-preferences/taskCompleted',
				params: { id: 'taskCompleted' },
				body: { value: false }
			});

			expect(res.status).toBe(200);
			expect(res.body).toEqual({
				success: true,
				message: 'Task completed alerts are off. Saved.'
			});
			const [row] = await testDb()
				.select()
				.from(subscriptions)
				.where(eq(subscriptions.userId, user.id));
			expect(row.notificationMethods).toEqual({
				email: true,
				sms: true,
				preferences: {
					taskAssigned: true,
					taskCompleted: false,
					familyJoined: false,
					aiSuggestions: true
				}
			});
		});

		it('creates a tierless row on the first toggle', async () => {
			if (!preferenceRoute) throw new Error('preference route did not load');
			const user = await seedUser(testDb());

			const res = await invoke(preferenceRoute.PUT, {
				ctx: ctx(),
				user,
				method: 'PUT',
				path: '/api/me/notification-preferences/familyJoined',
				params: { id: 'familyJoined' },
				body: { value: true }
			});

			expect(res.status).toBe(200);
			expect(res.body).toEqual({
				success: true,
				message: 'Someone joined the family alerts are on. Saved.'
			});
			const rows = await testDb()
				.select()
				.from(subscriptions)
				.where(eq(subscriptions.userId, user.id));
			expect(rows).toHaveLength(1);
			expect(rows[0].subscriptionTypeId).toBeNull();
			expect(rows[0].endDate.toISOString()).toBe('9999-12-31T00:00:00.000Z');
			expect(rows[0].notificationMethods).toEqual({
				email: false,
				sms: false,
				preferences: {
					taskAssigned: true,
					taskCompleted: true,
					familyJoined: true,
					aiSuggestions: true
				}
			});
		});

		it('answers 400 {"error":"Unknown notification preference"} for an id outside the four', async () => {
			if (!preferenceRoute) throw new Error('preference route did not load');
			const user = await seedUser(testDb());
			const res = await invoke(preferenceRoute.PUT, {
				ctx: ctx(),
				user,
				method: 'PUT',
				path: '/api/me/notification-preferences/email',
				params: { id: 'email' },
				body: { value: true }
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'Unknown notification preference' });
			expect(await testDb().select().from(subscriptions)).toHaveLength(0);
		});

		it.each([
			{ label: 'a missing value', body: {} },
			{ label: 'a string value', body: { value: 'true' } },
			{ label: 'a null value', body: { value: null } },
			{ label: 'a numeric value', body: { value: 1 } }
		])(
			'answers 400 {"error":"Notification preference value is required"} for $label',
			async ({ body }) => {
				if (!preferenceRoute) throw new Error('preference route did not load');
				const user = await seedUser(testDb());
				const res = await invoke(preferenceRoute.PUT, {
					ctx: ctx(),
					user,
					method: 'PUT',
					path: '/api/me/notification-preferences/taskAssigned',
					params: { id: 'taskAssigned' },
					body
				});
				expect(res.status).toBe(400);
				expect(res.body).toEqual({ error: 'Notification preference value is required' });
			}
		);

		it('answers 400 {"error":"Invalid JSON"} for a non-object body', async () => {
			if (!preferenceRoute) throw new Error('preference route did not load');
			const user = await seedUser(testDb());
			const res = await invoke(preferenceRoute.PUT, {
				ctx: ctx(),
				user,
				method: 'PUT',
				path: '/api/me/notification-preferences/taskAssigned',
				params: { id: 'taskAssigned' },
				rawBody: '["on"]'
			});
			expect(res.status).toBe(400);
			expect(res.body).toEqual({ error: 'Invalid JSON' });
		});

		it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
			if (!preferenceRoute) throw new Error('preference route did not load');
			const res = await invoke(preferenceRoute.PUT, {
				ctx: ctx(),
				method: 'PUT',
				path: '/api/me/notification-preferences/taskAssigned',
				params: { id: 'taskAssigned' },
				body: { value: true }
			});
			expect(res).toMatchObject({ status: 401, body: { error: 'Unauthorized' } });
		});
	}
);
