/**
 * identity person service against real Postgres: the guest row and its UTC
 * settings, the masked email, the profile allowlist, the hourly touch, the
 * stored zone and the delete cascade. Each test runs in `rollbackTest` and
 * gives the ctx a fixed clock, so every stamp is the instant the test names.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import { apiTokens, authAccount, authSession, userSettings, users } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import {
	seedIdentityApiToken,
	seedIdentitySession,
	seedIdentitySettings
} from './identity.fixtures.server';
import {
	createAnonymousAccount,
	createPersonWithPassword,
	deletePerson,
	getPerson,
	getPersonByEmail,
	getTimeZone,
	isEmailTaken,
	listPersonNames,
	touchLastActive,
	updatePersonProfile,
	type ProfileInput
} from './identity.person.service.server';
import { personFullName } from './identity.person.rules';
import { verifyPassword } from './identity.credentials.service.server';

const NOW = new Date('2026-04-01T12:00:00.000Z');

describe('creating people', () => {
	rollbackTest('with a password writes the user and its credential row in one transaction', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });

		const person = await createPersonWithPassword(ctx, {
			email: 'new@example.test',
			firstName: 'New',
			lastName: 'Person',
			password: 'correct horse'
		});

		expect(person).toMatchObject({
			id: 'id-1',
			email: 'new@example.test',
			firstName: 'New',
			lastName: 'Person',
			emailVerified: false,
			roles: []
		});
		expect(person.passwordHash).toBeTruthy();
		expect(await verifyPassword('correct horse', person.passwordHash ?? '')).toBe(true);

		const [credential] = await db.select().from(authAccount).where(eq(authAccount.id, 'pw-id-1'));
		expect(credential).toMatchObject({
			userId: 'id-1',
			providerId: 'credential',
			accountId: 'id-1',
			password: person.passwordHash
		});
	});

	rollbackTest('without a password writes only the user row (the child door)', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });

		const person = await createPersonWithPassword(ctx, {
			email: 'child@example.test',
			firstName: 'Kid',
			lastName: 'Person',
			emailVerified: true
		});

		expect(person.passwordHash).toBeNull();
		expect(await db.select().from(authAccount)).toEqual([]);
	});

	rollbackTest('rolls the user back when the credential row cannot be written', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const blocker = await seedUser(db);
		await db.insert(authAccount).values({
			id: 'pw-id-1',
			userId: blocker.id,
			providerId: 'credential',
			accountId: blocker.id,
			password: 'already-there'
		});

		await expect(
			createPersonWithPassword(ctx, {
				email: 'stranded@example.test',
				firstName: 'Stranded',
				lastName: 'Person',
				password: 'correct horse'
			})
		).rejects.toThrow();
		expect(await db.select().from(users).where(eq(users.email, 'stranded@example.test'))).toEqual(
			[]
		);
	});

	rollbackTest('getPersonByEmail is an exact match and isEmailTaken reports it', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const user = await seedUser(db, { email: 'mia@example.test' });

		expect((await getPersonByEmail(ctx, 'mia@example.test'))?.id).toBe(user.id);
		expect(await getPersonByEmail(ctx, 'MIA@example.test')).toBeNull();
		expect(await isEmailTaken(ctx, 'mia@example.test')).toBe(true);
		expect(await isEmailTaken(ctx, 'nobody@example.test')).toBe(false);
	});
});

describe('Anonymous Account', () => {
	rollbackTest('creates an Anonymous Account with UTC settings in one write', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const person = await createAnonymousAccount(ctx);

		expect(person.id).toBe('id-1');
		expect(person.email).toBe('id-1@anonymous.placeholder.invalid');
		expect(person.firstName).toBe('Guest');
		expect(person.lastName).toBe('');
		expect(person.emailVerified).toBe(false);
		expect(person.roles).toEqual([]);
		expect(person.createdAt).toEqual(NOW);

		const rows = await db.select().from(userSettings).where(eq(userSettings.userId, person.id));
		expect(rows).toHaveLength(1);
		expect(rows[0].timeZone).toBe('UTC');
		expect(rows[0].updatedAt).toEqual(NOW);
	});
});

describe('people', () => {
	rollbackTest('getPerson answers the caller’s row and masks a guest’s email', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const registered = await seedUser(db, { firstName: 'Mia', lastName: 'Lopez' });
		const guest = await seedUser(db, { email: 'guest@anonymous.placeholder.invalid' });

		expect(await getPerson(ctx, actorFromUser(registered, 'session'))).toEqual({
			id: registered.id,
			firstName: 'Mia',
			lastName: 'Lopez',
			email: registered.email,
			emailVerified: true,
			isAnonymous: false,
			roles: [],
			lastActiveAt: registered.lastActiveAt
		});
		const guestView = await getPerson(ctx, actorFromUser(guest, 'session'));
		expect(guestView.email).toBeNull();
		expect(guestView.isAnonymous).toBe(true);
	});

	rollbackTest('updatePersonProfile trims both names and drops privilege fields', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const user = await seedUser(db, { firstName: 'Old', lastName: 'Name' });
		const privilegeField = {
			firstName: '  Mia ',
			lastName: ' Lopez  ',
			email: 'evil@example.test'
		} as unknown as ProfileInput;

		const view = await updatePersonProfile(ctx, actorFromUser(user, 'session'), privilegeField);
		expect([view.firstName, view.lastName]).toEqual(['Mia', 'Lopez']);

		const [row] = await db.select().from(users).where(eq(users.id, user.id));
		expect([row.firstName, row.lastName, row.email]).toEqual(['Mia', 'Lopez', user.email]);
		expect(row.updatedAt).toEqual(NOW);
	});

	rollbackTest('updatePersonProfile keeps the legacy 400 copy for a blank name', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const user = await seedUser(db, { firstName: 'Unchanged', lastName: 'Person' });
		const actor = actorFromUser(user, 'session');

		await expect(
			updatePersonProfile(ctx, actor, { firstName: '   ', lastName: 'Lopez' })
		).rejects.toMatchObject({
			code: 'invalid',
			status: 400,
			message: 'First name and last name are required'
		});
		const [row] = await db.select().from(users).where(eq(users.id, user.id));
		expect([row.firstName, row.lastName]).toEqual(['Unchanged', 'Person']);
	});

	rollbackTest('touchLastActive writes at most once an hour', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const recent = await seedUser(db, {
			lastActiveAt: new Date(NOW.getTime() - 30 * 60 * 1000)
		});
		const stale = await seedUser(db, {
			lastActiveAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000)
		});

		expect(await touchLastActive(ctx, actorFromUser(recent, 'session'))).toBe(false);
		const [recentRow] = await db.select().from(users).where(eq(users.id, recent.id));
		expect(recentRow.lastActiveAt).not.toEqual(NOW);

		expect(await touchLastActive(ctx, actorFromUser(stale, 'session'))).toBe(true);
		const [staleRow] = await db.select().from(users).where(eq(users.id, stale.id));
		expect(staleRow.lastActiveAt).toEqual(NOW);
	});

	rollbackTest('getTimeZone resolves the stored zone, pseudo-zones included', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const tokyo = await seedUser(db);
		const pseudo = await seedUser(db);
		const invalid = await seedUser(db);
		const none = await seedUser(db);
		await seedIdentitySettings(tokyo.id, { timeZone: 'Asia/Tokyo' }, db);
		await seedIdentitySettings(pseudo.id, { timeZone: 'UTC+5' }, db);
		await seedIdentitySettings(invalid.id, { timeZone: 'Mars/Base' }, db);

		expect(await getTimeZone(ctx, tokyo.id)).toBe('Asia/Tokyo');
		expect(await getTimeZone(ctx, pseudo.id)).toBe('UTC+5');
		expect(await getTimeZone(ctx, invalid.id)).toBeUndefined();
		expect(await getTimeZone(ctx, none.id)).toBeUndefined();
	});

	rollbackTest('listPersonNames answers the stored names of the ids it is given', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const mia = await seedUser(db, { firstName: 'Mia', lastName: 'Diaz' });
		// users.lastName is NOT NULL, so an empty last name is the realistic edge.
		const sam = await seedUser(db, { firstName: 'Sam', lastName: '' });
		await seedUser(db, { firstName: 'Unasked', lastName: 'Person' });

		const names = await listPersonNames(ctx, [mia.id, sam.id, 'no-such-person']);

		expect(names).toHaveLength(2);
		expect(names).toEqual(
			expect.arrayContaining([
				{ id: mia.id, firstName: 'Mia', lastName: 'Diaz' },
				{ id: sam.id, firstName: 'Sam', lastName: '' }
			])
		);
		expect(names.map(personFullName)).toEqual(expect.arrayContaining(['Mia Diaz', 'Sam ']));
		expect(await listPersonNames(ctx, [])).toEqual([]);
	});

	rollbackTest('deletePerson removes the row and cascades sessions, settings and tokens', async (db) => {
		const ctx = testCtx({ db, now: NOW.toISOString() });
		const user = await seedUser(db);
		const other = await seedUser(db);
		await seedIdentitySettings(user.id, {}, db);
		await seedIdentitySession(user.id, 'sess-a', {}, db);
		await seedIdentityApiToken(user.id, { id: 'tok-a' }, db);
		await seedIdentitySession(other.id, 'sess-other', {}, db);

		expect(await deletePerson(ctx, actorFromUser(user, 'session'))).toBe(true);
		expect(await db.select().from(users).where(eq(users.id, user.id))).toEqual([]);
		expect(await db.select().from(userSettings).where(eq(userSettings.userId, user.id))).toEqual(
			[]
		);
		expect(await db.select().from(authSession).where(eq(authSession.userId, user.id))).toEqual(
			[]
		);
		expect(await db.select().from(apiTokens).where(eq(apiTokens.userId, user.id))).toEqual([]);
		expect(await db.select().from(users).where(eq(users.id, other.id))).toHaveLength(1);
	});
});
