/**
 * alerts push services against real Postgres: device tokens, Web Push
 * subscriptions and the two fan-outs. Every test drives the kernel `Push`
 * port (a memory push), so nothing reaches `web-push` or Firebase, and the
 * expected message shapes are the legacy `fcmService` builders'.
 *
 * Doc: ./README.md#how-to-test
 */
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import type { Db } from '$lib/kernel/db/database.server';
import { deviceTokens, pushSubscriptions } from '$lib/kernel/db/tables.server';
import { createMemoryPush, type MemoryPush } from '$lib/kernel/push/push';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx, type TestCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest, testDb } from '$lib/kernel/testing/testDb.server';
import {
	getPushPublicKey,
	nudgeEventsChanged,
	registerDevice,
	removePushSubscription,
	savePushSubscription,
	sendAlertPush,
	unregisterDevice
} from './alerts.push.service.server';
import { seedDeviceToken, seedPushSubscription } from './alerts.fixtures.server';

const NOW = '2026-03-01T09:00:00.000Z';
const ENDPOINT = 'https://push.example.test/subscription/1';

/** A ctx with VAPID set (web leg on) or not, and the given push port. */
function pushCtx(
	db: Db,
	push: MemoryPush,
	options: { readonly vapid?: boolean } = {}
): TestCtx {
	const base = testCtx({ db, now: NOW });
	if (!options.vapid) return { ...base, push };
	return {
		...base,
		push,
		config: {
			...base.config,
			vapidPublicKey: 'BPublicKeyForTests',
			vapidPrivateKey: 'private-key-for-tests'
		}
	};
}

const NOTICE = { title: 'Kim', body: 'asked you to take "Bins"', link: '/calendar/tasks' };

describe('registerDevice', () => {
	rollbackTest('upserts the token, re-owning it and refreshing lastSeenAt', async (db) => {
		const first = await seedUser(db);
		const second = await seedUser(db);
		const ctx = testCtx({ db, now: NOW });

		await registerDevice(ctx, actorFromUser(first, 'session'), {
			token: 'token-1',
			platform: 'android'
		});
		await registerDevice(ctx, actorFromUser(second, 'token'), {
			token: 'token-1',
			platform: 'android'
		});

		const rows = await db.select().from(deviceTokens);
		expect(rows).toHaveLength(1);
		expect(rows[0].userId).toBe(second.id);
		expect(rows[0].lastSeenAt.toISOString()).toBe(NOW);
	});
});

describe('unregisterDevice', () => {
	rollbackTest("deletes only the caller's row for the token", async (db) => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		await seedDeviceToken(user.id, 'mine', {}, db);
		await seedDeviceToken(other.id, 'theirs', {}, db);

		await unregisterDevice(testCtx({ db, now: NOW }), actorFromUser(user, 'session'), 'mine');

		expect((await db.select().from(deviceTokens)).map((row) => row.token)).toEqual(['theirs']);
	});
});

describe('savePushSubscription', () => {
	rollbackTest('upserts by endpoint and re-owns it to the caller', async (db) => {
		const first = await seedUser(db);
		const second = await seedUser(db);
		const ctx = testCtx({ db, now: NOW });

		await savePushSubscription(ctx, actorFromUser(first, 'session'), {
			endpoint: ENDPOINT,
			keys: { p256dh: 'first-p256dh', auth: 'first-auth' }
		});
		await savePushSubscription(ctx, actorFromUser(second, 'session'), {
			endpoint: ENDPOINT,
			keys: { p256dh: 'second-p256dh', auth: 'second-auth' }
		});

		const rows = await db.select().from(pushSubscriptions);
		expect(rows).toHaveLength(1);
		expect([rows[0].userId, rows[0].p256dh, rows[0].auth]).toEqual([
			second.id,
			'second-p256dh',
			'second-auth'
		]);
	});
});

describe('removePushSubscription', () => {
	rollbackTest('deletes only the caller row for that endpoint', async (db) => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		const otherEndpoint = 'https://push.example.test/subscription/2';
		await seedPushSubscription(user.id, ENDPOINT, {}, db);
		await seedPushSubscription(other.id, otherEndpoint, {}, db);

		await removePushSubscription(
			testCtx({ db, now: NOW }),
			actorFromUser(user, 'session'),
			ENDPOINT
		);

		const rows = await db.select().from(pushSubscriptions);
		expect(rows.map((row) => [row.userId, row.endpoint])).toEqual([[other.id, otherEndpoint]]);
	});
});

describe('getPushPublicKey', () => {
	// Q-020: a client must not subscribe to a server that can never send, so the
	// answer is the public half only while the private half is set too.
	const vapidPairs: ReadonlyArray<{
		readonly label: string;
		readonly publicKey: string | null;
		readonly privateKey: string | null;
		readonly expected: string | null;
	}> = [
		{ label: 'neither half', publicKey: null, privateKey: null, expected: null },
		{
			label: 'only the public half',
			publicKey: 'BPublicKeyForTests',
			privateKey: null,
			expected: null
		},
		{
			label: 'only the private half',
			publicKey: null,
			privateKey: 'private-key-for-tests',
			expected: null
		},
		{
			label: 'both halves',
			publicKey: 'BPublicKeyForTests',
			privateKey: 'private-key-for-tests',
			expected: 'BPublicKeyForTests'
		}
	];

	it.each(vapidPairs)(
		'answers $expected when $label is configured',
		({ publicKey, privateKey, expected }) => {
			const base = testCtx({ db: testDb(), now: NOW });
			const ctx: TestCtx = {
				...base,
				config: { ...base.config, vapidPublicKey: publicKey, vapidPrivateKey: privateKey }
			};
			expect(getPushPublicKey(ctx)).toEqual({ publicKey: expected });
		}
	);
});

describe('sendAlertPush', () => {
	rollbackTest('sends the alert payload to every subscription and device token', async (db) => {
		const user = await seedUser(db);
		const otherEndpoint = 'https://push.example.test/subscription/2';
		await seedPushSubscription(user.id, ENDPOINT, {}, db);
		await seedPushSubscription(user.id, otherEndpoint, { p256dh: 'p2', auth: 'a2' }, db);
		await seedDeviceToken(user.id, 'token-1', {}, db);
		const ctx = pushCtx(db, createMemoryPush({ devicesConfigured: true }), { vapid: true });

		await sendAlertPush(ctx, user.id, NOTICE);

		expect(ctx.push.sent).toHaveLength(3);
		expect(ctx.push.sent).toEqual(
			expect.arrayContaining([
				{
					channel: 'web',
					subscription: { endpoint: ENDPOINT, p256dh: 'p256dh-key', auth: 'auth-key' },
					notice: NOTICE
				},
				{
					channel: 'web',
					subscription: { endpoint: otherEndpoint, p256dh: 'p2', auth: 'a2' },
					notice: NOTICE
				},
				{
					channel: 'device',
					token: 'token-1',
					body: {
						notification: { title: 'Kim', body: 'asked you to take "Bins"' },
						data: { type: 'notification', link: '/calendar/tasks' },
						android: { priority: 'high' }
					}
				}
			])
		);
	});

	rollbackTest('does no work when VAPID is unset and the device channel is off', async (db) => {
		const user = await seedUser(db);
		await seedPushSubscription(user.id, ENDPOINT, {}, db);
		await seedDeviceToken(user.id, 'token-1', {}, db);
		const ctx = pushCtx(db, createMemoryPush({ devicesConfigured: false }));

		await sendAlertPush(ctx, user.id, NOTICE);

		expect(ctx.push.sent).toEqual([]);
		expect(await db.select().from(pushSubscriptions)).toHaveLength(1);
	});

	rollbackTest('prunes a subscription the push service reports gone', async (db) => {
		const user = await seedUser(db);
		await seedPushSubscription(user.id, ENDPOINT, {}, db);
		const push = createMemoryPush();
		push.willDeliver('dead');
		const ctx = pushCtx(db, push, { vapid: true });

		await sendAlertPush(ctx, user.id, NOTICE);

		expect(await db.select().from(pushSubscriptions)).toEqual([]);
	});

	rollbackTest('prunes a device token FCM reports unregistered', async (db) => {
		const user = await seedUser(db);
		await seedDeviceToken(user.id, 'token-1', {}, db);
		const push = createMemoryPush({ devicesConfigured: true });
		push.willDeliver('dead');
		const ctx = pushCtx(db, push);

		await sendAlertPush(ctx, user.id, NOTICE);

		expect(await db.select().from(deviceTokens)).toEqual([]);
	});

	rollbackTest('one channel failing never blocks the other or rejects', async (db) => {
		const user = await seedUser(db);
		await seedPushSubscription(user.id, ENDPOINT, {}, db);
		await seedDeviceToken(user.id, 'token-1', {}, db);
		const memory = createMemoryPush({ devicesConfigured: true });
		const flaky: MemoryPush = {
			...memory,
			send: async (message) => {
				if (message.channel === 'web') throw new Error('web push is down');
				return memory.send(message);
			}
		};
		const ctx = pushCtx(db, flaky, { vapid: true });

		await expect(sendAlertPush(ctx, user.id, NOTICE)).resolves.toBeUndefined();

		expect(memory.sent.map((message) => message.channel)).toEqual(['device']);
		expect(ctx.log.entries).toContainEqual(
			expect.objectContaining({ level: 'error', event: 'alert_push_channel_failed' })
		);
	});
});

describe('nudgeEventsChanged', () => {
	rollbackTest('sends one data-only message per token, users deduped', async (db) => {
		const actor = await seedUser(db);
		const member = await seedUser(db);
		await seedDeviceToken(actor.id, 'actor-token', {}, db);
		await seedDeviceToken(member.id, 'member-token', {}, db);
		const ctx = pushCtx(db, createMemoryPush({ devicesConfigured: true }));

		await nudgeEventsChanged(ctx, actorFromUser(actor, 'session'), {
			userIds: [actor.id, member.id, actor.id]
		});

		expect(ctx.push.sent).toHaveLength(2);
		expect(ctx.push.sent).toEqual(
			expect.arrayContaining([
				{
					channel: 'device',
					token: 'actor-token',
					body: {
						data: { type: 'events_changed', actorId: actor.id },
						android: { priority: 'high', collapse_key: 'events_changed', ttl: '600s' }
					}
				},
				{
					channel: 'device',
					token: 'member-token',
					body: {
						data: { type: 'events_changed', actorId: actor.id },
						android: { priority: 'high', collapse_key: 'events_changed', ttl: '600s' }
					}
				}
			])
		);
	});

	rollbackTest('includes the actor even when the caller passes only other users', async (db) => {
		const actor = await seedUser(db);
		const member = await seedUser(db);
		await seedDeviceToken(actor.id, 'actor-token', {}, db);
		await seedDeviceToken(member.id, 'member-token', {}, db);
		const ctx = pushCtx(db, createMemoryPush({ devicesConfigured: true }));

		await nudgeEventsChanged(ctx, actorFromUser(actor, 'session'), { userIds: [member.id] });

		const tokens = ctx.push.sent
			.flatMap((message) => (message.channel === 'device' ? [message.token] : []))
			.sort();
		expect(tokens).toEqual(['actor-token', 'member-token']);
	});

	rollbackTest('skips silently (no send) when FCM is not configured', async (db) => {
		const actor = await seedUser(db);
		await seedDeviceToken(actor.id, 'actor-token', {}, db);
		const ctx = pushCtx(db, createMemoryPush({ devicesConfigured: false }));

		await nudgeEventsChanged(ctx, actorFromUser(actor, 'session'), { userIds: [actor.id] });

		expect(ctx.push.sent).toEqual([]);
		expect(
			await db
				.select()
				.from(deviceTokens)
				.where(and(eq(deviceTokens.userId, actor.id), eq(deviceTokens.token, 'actor-token')))
		).toHaveLength(1);
	});
});
