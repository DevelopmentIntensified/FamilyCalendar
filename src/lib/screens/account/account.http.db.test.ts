/**
 * account — golden contract for the /api routes this screen owns: GET and
 * DELETE /api/me, and GET /api/account/export.
 *
 * Committed mode (beforeEach truncateAll) because the legacy handlers write
 * through the `db` singleton, outside any test transaction. The routes are
 * imported by path, so after the port re-exports the new handlers this file
 * keeps pinning the same wire (docs/rewrite/playbooks/characterize-endpoints.md).
 * The `/api/me` chain pulls `accountData` → `sendEmail` → `$env/static/private`,
 * so the db run needs `RESEND_API_KEY` in the environment (it is in `.env`).
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	apiTokens,
	authSession,
	bills,
	eventAttendance,
	eventExceptions,
	events,
	families,
	familyMembers,
	groceryItems,
	notifications,
	receiptItems,
	subscriptions,
	taskCompletions,
	taskTags,
	tasks,
	userSettings,
	users
} from '$lib/kernel/db/tables.server';
import { invoke } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser, uniqueSuffix } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
// The ROUTE modules, not the legacy actions: these imports survive the port.
import { GET as getExport } from '../../../routes/api/account/export/+server';
import { DELETE as deleteMe, GET as getMe } from '../../../routes/api/me/+server';

const ctx = () => testCtx({ db: testDb() });

/** A row as the JSON body carries it: dates become ISO strings. */
function asJson<T>(value: T) {
	return JSON.parse(JSON.stringify(value));
}

/** The users row minus the credential the export must never carry. */
function exportedAccount<T extends { passwordHash?: unknown }>(user: T) {
	const { passwordHash: _dropped, ...account } = user;
	void _dropped;
	return asJson(account);
}

async function seedFamilyWithMember(userId: string, otherUserId: string) {
	const [family] = await testDb().insert(families).values({ name: 'Lovelace' }).returning();
	await testDb()
		.insert(familyMembers)
		.values({ userId, familyId: family.id, role: 'owner', memberType: 'parent' });
	await testDb()
		.insert(familyMembers)
		.values({ userId: otherUserId, familyId: family.id, role: 'member', memberType: 'member' });
	return family;
}

describe('GET /api/me', () => {
	beforeEach(truncateAll);

	it('answers the caller identity, roles, ISO lastActiveAt and familyId', async () => {
		const db = testDb();
		const user = await seedUser(db, {
			firstName: 'Ann',
			lastName: 'Lee',
			email: `ann-${uniqueSuffix()}@example.test`,
			emailVerified: true,
			roles: ['admin'],
			lastActiveAt: new Date('2026-11-01T10:00:00.000Z')
		});
		const other = await seedUser(db);
		const family = await seedFamilyWithMember(user.id, other.id);

		const res = await invoke(getMe, { ctx: ctx(), user, path: '/api/me' });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			id: user.id,
			firstName: 'Ann',
			lastName: 'Lee',
			email: user.email,
			emailVerified: true,
			isAnonymous: false,
			roles: ['admin'],
			lastActiveAt: '2026-11-01T10:00:00.000Z',
			familyId: family.id
		});
	});

	it('masks an Anonymous Account placeholder email and reports isAnonymous', async () => {
		const db = testDb();
		const user = await seedUser(db, {
			firstName: 'Guest',
			email: `guest-${uniqueSuffix()}@anonymous.placeholder.invalid`,
			emailVerified: false
		});

		const res = await invoke(getMe, { ctx: ctx(), user, path: '/api/me' });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			id: user.id,
			firstName: 'Guest',
			lastName: user.lastName,
			email: null,
			emailVerified: false,
			isAnonymous: true,
			roles: [],
			lastActiveAt: user.lastActiveAt.toISOString(),
			familyId: null
		});
	});

	it('reports email null with isAnonymous false for a real account with no email', async () => {
		const db = testDb();
		const user = await seedUser(db, { email: null, emailVerified: false });

		const res = await invoke(getMe, { ctx: ctx(), user, path: '/api/me' });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			id: user.id,
			firstName: user.firstName,
			lastName: user.lastName,
			email: null,
			emailVerified: false,
			isAnonymous: false,
			roles: [],
			lastActiveAt: user.lastActiveAt.toISOString(),
			familyId: null
		});
	});

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(getMe, { ctx: ctx(), path: '/api/me' });
		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});
});

describe('DELETE /api/me', () => {
	beforeEach(truncateAll);

	it('answers 401 {"error":"Unauthorized"} when signed out and deletes nothing', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(deleteMe, {
			ctx: ctx(),
			method: 'DELETE',
			path: '/api/me',
			body: { confirmation: user.id }
		});
		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
		expect(await testDb().select().from(users).where(eq(users.id, user.id))).toHaveLength(1);
	});

	it('rejects a confirmation that is not the caller id and deletes nothing', async () => {
		const db = testDb();
		const user = await seedUser(db);
		await db.insert(authSession).values({
			id: `s-${uniqueSuffix()}`,
			token: `t-${uniqueSuffix()}`,
			userId: user.id,
			expiresAt: new Date('2027-01-01T00:00:00.000Z')
		});

		const res = await invoke(deleteMe, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			path: '/api/me',
			body: { confirmation: 'someone-else' }
		});

		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Confirmation does not match' });
		expect(await db.select().from(users).where(eq(users.id, user.id))).toHaveLength(1);
		const sessions = await db.select().from(authSession).where(eq(authSession.userId, user.id));
		expect(sessions).toHaveLength(1);
	});

	it('rejects an absent confirmation with the same message', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(deleteMe, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			path: '/api/me'
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Confirmation does not match' });
		expect(await testDb().select().from(users).where(eq(users.id, user.id))).toHaveLength(1);
	});

	it('rejects a null confirmation with the same message', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(deleteMe, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			path: '/api/me',
			body: { confirmation: null }
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Confirmation does not match' });
	});

	it('answers 400 {"error":"Invalid JSON"} for a malformed body', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(deleteMe, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			path: '/api/me',
			rawBody: '{'
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Invalid JSON' });
		expect(await testDb().select().from(users).where(eq(users.id, user.id))).toHaveLength(1);
	});

	it('answers 400 {"error":"Invalid JSON"} for a non-object body', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(deleteMe, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			path: '/api/me',
			rawBody: '[]'
		});
		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'Invalid JSON' });
	});

	it('deletes the account, its sessions, tokens and subscription after the typed id', async () => {
		const db = testDb();
		const user = await seedUser(db);
		const other = await seedUser(db);
		await db.insert(authSession).values([
			{
				id: `s-${uniqueSuffix()}`,
				token: `t-${uniqueSuffix()}`,
				userId: user.id,
				expiresAt: new Date('2027-01-01T00:00:00.000Z')
			},
			{
				id: `s-${uniqueSuffix()}`,
				token: `t-${uniqueSuffix()}`,
				userId: user.id,
				expiresAt: new Date('2027-01-01T00:00:00.000Z')
			}
		]);
		await db.insert(authSession).values({
			id: `s-${uniqueSuffix()}`,
			token: `t-${uniqueSuffix()}`,
			userId: other.id,
			expiresAt: new Date('2027-01-01T00:00:00.000Z')
		});
		await db.insert(apiTokens).values({
			userId: user.id,
			name: 'Laptop',
			tokenHash: `hash-${uniqueSuffix()}`
		});
		await db.insert(subscriptions).values({
			userId: user.id,
			endDate: new Date('2027-01-01T00:00:00.000Z'),
			notificationMethods: { email: true, sms: false }
		});

		const res = await invoke(deleteMe, {
			ctx: ctx(),
			user,
			method: 'DELETE',
			path: '/api/me',
			body: { confirmation: user.id }
		});

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true });
		expect(await db.select().from(users).where(eq(users.id, user.id))).toEqual([]);
		expect(await db.select().from(authSession).where(eq(authSession.userId, user.id))).toEqual([]);
		expect(await db.select().from(apiTokens).where(eq(apiTokens.userId, user.id))).toEqual([]);
		expect(await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id))).toEqual(
			[]
		);
		expect(await db.select().from(users).where(eq(users.id, other.id))).toHaveLength(1);
		const otherSessions = await db
			.select()
			.from(authSession)
			.where(eq(authSession.userId, other.id));
		expect(otherSessions).toHaveLength(1);
	});
});

describe('GET /api/account/export', () => {
	beforeEach(truncateAll);

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(getExport, { ctx: ctx(), path: '/api/account/export' });
		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
		expect(res.headers.get('content-type')).toContain('application/json');
		expect(res.headers.get('content-disposition')).toBeNull();
	});

	it('downloads the requester document and no other member private rows', async () => {
		const db = testDb();
		const user = await seedUser(db, {
			firstName: 'Ada',
			lastName: 'Lovelace',
			email: `ada-${uniqueSuffix()}@example.test`
		});
		const other = await seedUser(db, { firstName: 'Bob' });
		const family = await seedFamilyWithMember(user.id, other.id);
		const [settings] = await db
			.insert(userSettings)
			.values({ userId: user.id, timeZone: 'Europe/Madrid' })
			.returning();
		const [subscription] = await db
			.insert(subscriptions)
			.values({
				userId: user.id,
				endDate: new Date('2027-01-01T00:00:00.000Z'),
				notificationMethods: { email: true, sms: false }
			})
			.returning();
		const [task] = await db
			.insert(tasks)
			.values({ title: 'Mine', userId: user.id })
			.returning();
		const [bill] = await db
			.insert(bills)
			.values({ title: 'Rent', amountCents: 1000, userId: user.id })
			.returning();
		const [receiptItem] = await db
			.insert(receiptItems)
			.values({ billId: bill.id, label: 'Milk', priceCents: 250 })
			.returning();
		const [groceryItem] = await db
			.insert(groceryItems)
			.values({ userId: user.id, name: 'Milk', nameKey: 'milk' })
			.returning();
		const [notification] = await db
			.insert(notifications)
			.values({
				userId: user.id,
				type: 'task_assigned',
				actorName: 'Bob',
				message: 'A task was assigned to you'
			})
			.returning();

		// Another member's private rows: none of these may ride along.
		await db.insert(userSettings).values({ userId: other.id });
		const [otherTask] = await db
			.insert(tasks)
			.values({ title: 'Theirs', userId: other.id })
			.returning();
		await db.insert(taskTags).values({ taskId: otherTask.id, name: 'theirs' });
		await db.insert(taskCompletions).values({ taskId: otherTask.id, userId: other.id });
		const [otherBill] = await db
			.insert(bills)
			.values({ title: 'Their bill', amountCents: 5, userId: other.id })
			.returning();
		await db
			.insert(receiptItems)
			.values({ billId: otherBill.id, label: 'Eggs', priceCents: 100 });
		await db
			.insert(groceryItems)
			.values({ userId: other.id, name: 'Eggs', nameKey: 'eggs' });
		await db.insert(notifications).values({
			userId: other.id,
			type: 'task_assigned',
			actorName: 'Ada',
			message: 'Their notification'
		});
		const [otherEvent] = await db
			.insert(events)
			.values({
				ownerId: other.id,
				title: 'Their event',
				start: '2026-12-01T10:00:00.000Z'
			})
			.returning();
		await db.insert(eventAttendance).values({ eventId: otherEvent.id, userId: other.id });
		await db
			.insert(eventExceptions)
			.values({ eventId: otherEvent.id, originalDate: '2026-12-01T10:00:00.000Z' });

		const res = await invoke(getExport, {
			ctx: ctx(),
			user,
			path: '/api/account/export'
		});

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
		expect(res.headers.get('content-disposition')).toMatch(
			/^attachment; filename="familyplanz-export-\d{4}-\d{2}-\d{2}\.json"$/
		);
		expect(res.body).toEqual({
			version: 1,
			generatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
			account: exportedAccount(user),
			settings: [asJson(settings)],
			subscriptions: [asJson(subscription)],
			families: [
				{
					family: {
						id: family.id,
						name: 'Lovelace',
						color: null,
						createdAt: family.createdAt.toISOString()
					},
					membership: {
						userId: user.id,
						familyId: family.id,
						role: 'owner',
						memberType: 'parent'
					},
					otherMembers: [{ id: other.id, firstName: 'Bob', lastName: other.lastName }]
				}
			],
			events: [],
			eventAttendance: [],
			eventExceptions: [],
			tasks: [asJson(task)],
			taskTags: [],
			taskCompletions: [],
			bills: [asJson(bill)],
			receiptItems: [asJson(receiptItem)],
			groceryItems: [asJson(groceryItem)],
			notifications: [asJson(notification)]
		});
	});

	it('includes a task assigned to the requester even when someone else owns it', async () => {
		const db = testDb();
		const user = await seedUser(db);
		const other = await seedUser(db);
		const [assigned] = await db
			.insert(tasks)
			.values({ title: 'Handoff', userId: other.id, assignedTo: user.id })
			.returning();

		const res = await invoke(getExport, { ctx: ctx(), user, path: '/api/account/export' });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			version: 1,
			generatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
			account: exportedAccount(user),
			settings: [],
			subscriptions: [],
			families: [],
			events: [],
			eventAttendance: [],
			eventExceptions: [],
			tasks: [asJson(assigned)],
			taskTags: [],
			taskCompletions: [],
			bills: [],
			receiptItems: [],
			groceryItems: [],
			notifications: []
		});
	});

	it('exports empty collections for a user who has stored nothing', async () => {
		const user = await seedUser(testDb());
		const res = await invoke(getExport, { ctx: ctx(), user, path: '/api/account/export' });
		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			version: 1,
			generatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
			account: exportedAccount(user),
			settings: [],
			subscriptions: [],
			families: [],
			events: [],
			eventAttendance: [],
			eventExceptions: [],
			tasks: [],
			taskTags: [],
			taskCompletions: [],
			bills: [],
			receiptItems: [],
			groceryItems: [],
			notifications: []
		});
	});
});
