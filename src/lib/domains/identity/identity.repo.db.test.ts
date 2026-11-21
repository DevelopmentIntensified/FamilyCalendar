/**
 * The identity repo against real Postgres: every query that filters, scopes,
 * joins, stamps or cascades. Each test runs in `rollbackTest`, so the rows it
 * seeds vanish afterwards. Writes are given their `now`, so the tests assert
 * the stamped timestamps instead of trusting a clock.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import {
	accounts,
	apiTokens,
	authAccount,
	authSession,
	codes,
	userSettings,
	users
} from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { emailCodeKey } from './identity.code.rules';
import {
	IDENTITY_SEEDED_AT,
	seedIdentityAccountBinding,
	seedIdentityApiToken,
	seedIdentityEmailCode,
	seedIdentitySession,
	seedIdentitySettings,
	seedIdentitySparseSettings
} from './identity.fixtures.server';
import { ANONYMOUS_EMAIL_DOMAIN } from './identity.person.rules';
import {
	claimPersonEmail,
	deleteApiToken,
	deleteApiTokenByHash,
	deleteApiTokensForPerson,
	deleteEmailCodeByKey,
	deleteEmailCodesForEmail,
	deleteExpiredEmailCodes,
	deleteOtherSessions,
	deletePersonRow,
	deleteSession,
	deleteSessionsForPerson,
	findAccountBinding,
	findApiTokenHolder,
	findEmailCodeByKey,
	findPersonByEmail,
	findPersonById,
	findSessionByToken,
	findSettingsByPerson,
	insertAccountBinding,
	insertApiToken,
	insertEmailCode,
	insertPasswordCredential,
	insertPerson,
	insertSession,
	insertSettings,
	listApiTokensForPerson,
	listStaleAnonymousPeople,
	markPersonEmailVerified,
	renewSession,
	setPersonPasswordHash,
	touchApiTokenLastUsed,
	touchPersonLastActive,
	updatePersonNames,
	updateSettings
} from './identity.repo.server';

const NOW = new Date('2026-04-01T12:00:00.000Z');
const LATER = new Date('2026-04-02T08:30:00.000Z');

describe('people', () => {
	rollbackTest('findPersonById returns the row, or null for an unknown id', async (db) => {
		const user = await seedUser(db, { firstName: 'Mia' });
		expect((await findPersonById(db, user.id))?.firstName).toBe('Mia');
		expect(await findPersonById(db, 'missing-person')).toBeNull();
	});

	rollbackTest('findPersonByEmail matches the exact address only', async (db) => {
		const user = await seedUser(db, { email: 'mia@example.com' });
		expect((await findPersonByEmail(db, 'mia@example.com'))?.id).toBe(user.id);
		expect(await findPersonByEmail(db, 'MIA@example.com')).toBeNull();
		expect(await findPersonByEmail(db, 'nobody@example.com')).toBeNull();
	});

	rollbackTest('insertPerson stamps every timestamp with the given now', async (db) => {
		const row = await insertPerson(
			db,
			{
				id: 'person-new',
				firstName: 'Pat',
				lastName: 'Smith',
				email: 'pat@example.com',
				emailVerified: false,
				roles: []
			},
			NOW
		);
		expect(row).toMatchObject({ id: 'person-new', firstName: 'Pat', roles: [] });
		expect(
			[row.createdAt, row.updatedAt, row.lastActiveAt, row.lastLogin].map((date) => date.getTime())
		).toEqual([NOW.getTime(), NOW.getTime(), NOW.getTime(), NOW.getTime()]);
	});

	rollbackTest(
		'insertPasswordCredential writes the pw-<userId> credential row (migration 018 shape)',
		async (db) => {
			const user = await seedUser(db);
			await insertPasswordCredential(db, user.id, '$2a$10$hash', NOW);
			const rows = await db.select().from(authAccount).where(eq(authAccount.userId, user.id));
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({
				id: `pw-${user.id}`,
				userId: user.id,
				providerId: 'credential',
				accountId: user.id,
				password: '$2a$10$hash'
			});
			expect(rows[0].createdAt.getTime()).toBe(NOW.getTime());
			expect(rows[0].updatedAt.getTime()).toBe(NOW.getTime());
		}
	);

	// users.test.ts:173-188 (#168), against the real row.
	rollbackTest(
		'updatePersonNames writes the names and drops privilege fields even if handed them',
		async (db) => {
			const user = await seedUser(db, {
				firstName: 'Old',
				lastName: 'Name',
				email: 'keep@example.com',
				roles: []
			});
			const handed: Partial<typeof users.$inferSelect> = {
				firstName: 'Pat',
				lastName: 'Smith',
				email: 'mass.assigned@evil.test',
				emailVerified: false,
				passwordHash: '$2a$12$evil',
				roles: ['admin']
			};
			const row = await updatePersonNames(db, user.id, handed, NOW);
			expect(row).toMatchObject({
				firstName: 'Pat',
				lastName: 'Smith',
				email: 'keep@example.com',
				emailVerified: true,
				passwordHash: null,
				roles: []
			});
			expect(row?.updatedAt.getTime()).toBe(NOW.getTime());
			expect(await updatePersonNames(db, 'missing-person', { firstName: 'X' }, NOW)).toBeNull();
		}
	);

	rollbackTest('the privilege writes each touch only their own column', async (db) => {
		const user = await seedUser(db, {
			firstName: 'Mia',
			email: 'mia@example.com',
			emailVerified: false
		});
		const verified = await markPersonEmailVerified(db, user.id, NOW);
		expect(verified).toMatchObject({
			emailVerified: true,
			email: 'mia@example.com',
			firstName: 'Mia'
		});
		expect(verified?.updatedAt.getTime()).toBe(NOW.getTime());

		const hashed = await setPersonPasswordHash(db, user.id, '$2a$10$new', LATER);
		expect(hashed).toMatchObject({ passwordHash: '$2a$10$new', email: 'mia@example.com' });
		expect(hashed?.updatedAt.getTime()).toBe(LATER.getTime());

		expect(await markPersonEmailVerified(db, 'missing-person', NOW)).toBeNull();
		expect(await setPersonPasswordHash(db, 'missing-person', 'x', NOW)).toBeNull();
	});

	rollbackTest('claimPersonEmail sets the real address and marks it verified', async (db) => {
		const guest = await seedUser(db, {
			email: `guest${ANONYMOUS_EMAIL_DOMAIN}`,
			emailVerified: false
		});
		const row = await claimPersonEmail(db, guest.id, 'mia@example.com', NOW);
		expect(row).toMatchObject({ email: 'mia@example.com', emailVerified: true });
		expect(row?.updatedAt.getTime()).toBe(NOW.getTime());
		expect(await claimPersonEmail(db, 'missing-person', 'x@example.com', NOW)).toBeNull();
	});

	rollbackTest('touchPersonLastActive moves lastActiveAt, not the names', async (db) => {
		const user = await seedUser(db, {
			firstName: 'Mia',
			lastActiveAt: new Date('2026-01-01T00:00:00Z')
		});
		await touchPersonLastActive(db, user.id, NOW);
		const [row] = await db.select().from(users).where(eq(users.id, user.id));
		expect(row.lastActiveAt.getTime()).toBe(NOW.getTime());
		expect(row.updatedAt.getTime()).toBe(NOW.getTime());
		expect(row.firstName).toBe('Mia');
		expect(row.lastLogin.getTime()).toBe(user.lastLogin.getTime());
	});

	rollbackTest(
		'deletePersonRow deletes the person and cascades sessions, settings and tokens — no one else’s',
		async (db) => {
			const user = await seedUser(db);
			const other = await seedUser(db);
			await seedIdentitySession(user.id, 'sess-mine', {}, db);
			await seedIdentitySession(other.id, 'sess-other', {}, db);
			await seedIdentitySettings(user.id, {}, db);
			await seedIdentitySparseSettings(other.id, {}, db);
			await seedIdentityApiToken(user.id, {}, db);
			await seedIdentityApiToken(other.id, { id: 'tok-other', tokenHash: 'other-hash' }, db);

			expect(await deletePersonRow(db, user.id)).toBe(true);
			expect(await findPersonById(db, user.id)).toBeNull();
			expect((await db.select().from(authSession)).map((row) => row.id)).toEqual(['sess-other']);
			expect((await db.select().from(userSettings)).map((row) => row.userId)).toEqual([other.id]);
			expect((await db.select().from(apiTokens)).map((row) => row.id)).toEqual(['tok-other']);
			expect(await deletePersonRow(db, user.id)).toBe(false);
		}
	);

	rollbackTest(
		'listStaleAnonymousPeople keeps guests idle since before the cutoff, never a registered person',
		async (db) => {
			const cutoff = new Date('2026-03-01T00:00:00.000Z');
			const staleGuest = await seedUser(db, {
				email: `stale${ANONYMOUS_EMAIL_DOMAIN}`,
				lastActiveAt: new Date('2026-02-01T00:00:00.000Z')
			});
			await seedUser(db, {
				email: `active${ANONYMOUS_EMAIL_DOMAIN}`,
				lastActiveAt: new Date('2026-03-15T00:00:00.000Z')
			});
			await seedUser(db, {
				email: `edge${ANONYMOUS_EMAIL_DOMAIN}`,
				lastActiveAt: cutoff
			});
			await seedUser(db, {
				email: 'registered@example.com',
				lastActiveAt: new Date('2025-01-01T00:00:00.000Z')
			});
			await seedUser(db, {
				email: `inside${ANONYMOUS_EMAIL_DOMAIN}.example.com`,
				lastActiveAt: new Date('2025-01-01T00:00:00.000Z')
			});

			const stale = await listStaleAnonymousPeople(db, cutoff);
			expect(stale.map((row) => row.id)).toEqual([staleGuest.id]);
		}
	);
});

describe('settings', () => {
	rollbackTest('findSettingsByPerson returns the row, or null when there is none', async (db) => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		await seedIdentitySettings(user.id, {}, db);
		expect((await findSettingsByPerson(db, user.id))?.id).toBe('settings-a');
		expect(await findSettingsByPerson(db, other.id)).toBeNull();
	});

	rollbackTest(
		'insertSettings writes a sparse sign-up row whose other columns take their defaults',
		async (db) => {
			const user = await seedUser(db);
			const row = await insertSettings(db, { userId: user.id, timeZone: 'UTC' }, NOW);
			expect(row).toMatchObject({
				userId: user.id,
				weekStart: 'sunday',
				timeZone: 'UTC',
				color: null,
				defaultView: 'dayView',
				defaultCalendarId: null,
				syncEventsToFamilyCalendar: null,
				autoParseEventDetails: true,
				showDailyVerse: false,
				showAdsAsEvents: false,
				hiddenDashboardModules: null,
				useCloudAI: true,
				useLocalAI: true,
				verseTranslation: 'esv'
			});
			expect(row.updatedAt.getTime()).toBe(NOW.getTime());
		}
	);

	// userSettings.test.ts:27-45, against the real row.
	rollbackTest('updateSettings writes allowed fields, including explicit nulls', async (db) => {
		const user = await seedUser(db);
		await seedIdentitySettings(user.id, {}, db);
		const row = await updateSettings(
			db,
			user.id,
			{
				timeZone: 'Europe/Berlin',
				weekStart: 'sunday',
				defaultCalendarId: null,
				hiddenDashboardModules: ['board', 'grocery'],
				color: null
			},
			NOW
		);
		expect(row).toMatchObject({
			id: 'settings-a',
			timeZone: 'Europe/Berlin',
			weekStart: 'sunday',
			defaultCalendarId: null,
			hiddenDashboardModules: ['board', 'grocery'],
			color: null,
			defaultView: 'dashboard'
		});
		expect(row?.updatedAt.getTime()).toBe(NOW.getTime());
	});

	// userSettings.test.ts:47-60 plus the read-only AI flags (Q-014).
	rollbackTest(
		'updateSettings drops row-key, system and read-only fields even if handed them',
		async (db) => {
			const user = await seedUser(db);
			const victim = await seedUser(db);
			await seedIdentitySettings(user.id, { useCloudAI: true, useLocalAI: true }, db);
			const handed: Partial<typeof userSettings.$inferSelect> = {
				timeZone: 'UTC',
				id: 'settings-9',
				userId: victim.id,
				updatedAt: new Date(0),
				useCloudAI: false,
				useLocalAI: false
			};
			const row = await updateSettings(db, user.id, handed, NOW);
			expect(row).toMatchObject({
				id: 'settings-a',
				userId: user.id,
				timeZone: 'UTC',
				useCloudAI: true,
				useLocalAI: true
			});
			expect(row?.updatedAt.getTime()).toBe(NOW.getTime());
			expect(await findSettingsByPerson(db, victim.id)).toBeNull();
		}
	);

	rollbackTest('updateSettings re-stamps updatedAt with nothing writable', async (db) => {
		const user = await seedUser(db);
		await seedIdentitySettings(user.id, {}, db);
		const row = await updateSettings(db, user.id, {}, NOW);
		expect(row?.updatedAt.getTime()).toBe(NOW.getTime());
		expect(new Date(IDENTITY_SEEDED_AT).getTime()).not.toBe(NOW.getTime());
	});

	rollbackTest('updateSettings returns null when the person has no row', async (db) => {
		const user = await seedUser(db);
		expect(await updateSettings(db, user.id, { timeZone: 'UTC' }, NOW)).toBeNull();
	});
});

describe('sessions', () => {
	rollbackTest('insertSession returns the inserted row, stamped with now', async (db) => {
		const user = await seedUser(db);
		const expiresAt = new Date('2026-06-30T12:00:00.000Z');
		const row = await insertSession(
			db,
			{ id: 'sess-new', token: 'raw-token', userId: user.id, expiresAt },
			NOW
		);
		expect(row).toMatchObject({
			id: 'sess-new',
			token: 'raw-token',
			userId: user.id,
			ipAddress: null,
			userAgent: null
		});
		expect(row.expiresAt.getTime()).toBe(expiresAt.getTime());
		expect(row.createdAt.getTime()).toBe(NOW.getTime());
		expect(row.updatedAt.getTime()).toBe(NOW.getTime());
	});

	rollbackTest('findSessionByToken matches the raw token, or null', async (db) => {
		const user = await seedUser(db);
		await seedIdentitySession(user.id, 'sess-a', {}, db);
		expect((await findSessionByToken(db, 'token-sess-a'))?.id).toBe('sess-a');
		expect(await findSessionByToken(db, 'sess-a')).toBeNull();
	});

	rollbackTest('renewSession rolls expiresAt and updatedAt only', async (db) => {
		const user = await seedUser(db);
		const seeded = await seedIdentitySession(
			user.id,
			'sess-a',
			{ updatedAt: new Date('2026-03-01T00:00:00.000Z') },
			db
		);
		const expiresAt = new Date('2026-06-30T12:00:00.000Z');
		await renewSession(db, 'sess-a', expiresAt, NOW);
		const [row] = await db.select().from(authSession).where(eq(authSession.id, 'sess-a'));
		expect(row.expiresAt.getTime()).toBe(expiresAt.getTime());
		expect(row.updatedAt.getTime()).toBe(NOW.getTime());
		expect(row.createdAt.getTime()).toBe(seeded.createdAt.getTime());
		expect(row.token).toBe('token-sess-a');
	});

	rollbackTest('deleteSession removes exactly that session', async (db) => {
		const user = await seedUser(db);
		await seedIdentitySession(user.id, 'sess-a', {}, db);
		await seedIdentitySession(user.id, 'sess-b', {}, db);
		await deleteSession(db, 'sess-a');
		expect((await db.select().from(authSession)).map((row) => row.id)).toEqual(['sess-b']);
	});

	rollbackTest('deleteSessionsForPerson ends every session of that person only', async (db) => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		await seedIdentitySession(user.id, 'sess-a', {}, db);
		await seedIdentitySession(user.id, 'sess-b', {}, db);
		await seedIdentitySession(other.id, 'sess-other', {}, db);
		expect(await deleteSessionsForPerson(db, user.id)).toBe(2);
		expect((await db.select().from(authSession)).map((row) => row.id)).toEqual(['sess-other']);
	});

	rollbackTest(
		'deleteOtherSessions keeps the caller’s session and other people’s, and counts the rest',
		async (db) => {
			const user = await seedUser(db);
			const other = await seedUser(db);
			await seedIdentitySession(user.id, 'sess-mine', {}, db);
			await seedIdentitySession(user.id, 'sess-b', {}, db);
			await seedIdentitySession(user.id, 'sess-c', {}, db);
			await seedIdentitySession(other.id, 'sess-other', {}, db);
			await seedIdentityApiToken(user.id, {}, db);

			expect(await deleteOtherSessions(db, user.id, 'sess-mine')).toBe(2);
			const left = (await db.select().from(authSession)).map((row) => row.id).sort();
			expect(left).toEqual(['sess-mine', 'sess-other']);
			expect((await db.select().from(apiTokens)).map((row) => row.id)).toEqual(['tok-a']);
		}
	);

	rollbackTest('deleteOtherSessions with no session to keep ends every web session', async (db) => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		await seedIdentitySession(user.id, 'sess-a', {}, db);
		await seedIdentitySession(other.id, 'sess-other', {}, db);
		expect(await deleteOtherSessions(db, user.id, null)).toBe(1);
		expect((await db.select().from(authSession)).map((row) => row.id)).toEqual(['sess-other']);
	});

	rollbackTest(
		'deleteOtherSessions never ends another person’s session named as the one to keep',
		async (db) => {
			const user = await seedUser(db);
			const other = await seedUser(db);
			await seedIdentitySession(user.id, 'sess-a', {}, db);
			await seedIdentitySession(other.id, 'sess-other', {}, db);
			expect(await deleteOtherSessions(db, user.id, 'sess-other')).toBe(1);
			expect((await db.select().from(authSession)).map((row) => row.id)).toEqual(['sess-other']);
		}
	);
});

describe('api tokens', () => {
	rollbackTest('insertApiToken stores the hash and returns only the safe record', async (db) => {
		const user = await seedUser(db);
		const record = await insertApiToken(
			db,
			{ userId: user.id, name: 'My phone', tokenHash: 'hash-of-plaintext' },
			NOW
		);
		expect(Object.keys(record).sort()).toEqual(['createdAt', 'id', 'name']);
		expect(record.name).toBe('My phone');
		expect(record.createdAt.getTime()).toBe(NOW.getTime());
		const [row] = await db.select().from(apiTokens).where(eq(apiTokens.id, record.id));
		expect(row).toMatchObject({ userId: user.id, tokenHash: 'hash-of-plaintext', lastUsedAt: null });
	});

	rollbackTest(
		'listApiTokensForPerson lists only the person’s tokens, never a hash column',
		async (db) => {
			const user = await seedUser(db);
			const other = await seedUser(db);
			await seedIdentityApiToken(
				user.id,
				{ id: 'tok-a', createdAt: new Date('2026-10-05T08:00:00Z') },
				db
			);
			await seedIdentityApiToken(
				user.id,
				{
					id: 'tok-b',
					name: 'Tablet',
					tokenHash: 'hash-b',
					lastUsedAt: new Date('2026-10-08T09:30:00Z')
				},
				db
			);
			await seedIdentityApiToken(other.id, { id: 'tok-other', tokenHash: 'hash-other' }, db);

			const listed = await listApiTokensForPerson(db, user.id);
			// Q-110: no ORDER BY today, so the contract is the set.
			const byId = [...listed].sort((a, b) => a.id.localeCompare(b.id));
			expect(byId.map((token) => Object.keys(token).sort())).toEqual([
				['createdAt', 'id', 'lastUsedAt', 'name'],
				['createdAt', 'id', 'lastUsedAt', 'name']
			]);
			const shown = byId.map((token) => [token.id, token.name, token.lastUsedAt?.toISOString()]);
			expect(shown).toEqual([
				['tok-a', 'Phone', undefined],
				['tok-b', 'Tablet', '2026-10-08T09:30:00.000Z']
			]);
			expect(byId[0].lastUsedAt).toBeNull();
			expect(byId[0].createdAt.toISOString()).toBe('2026-10-05T08:00:00.000Z');
		}
	);

	rollbackTest('deleteApiToken is owner-scoped: a foreign or unknown id is a no-op', async (db) => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		await seedIdentityApiToken(user.id, { id: 'tok-mine' }, db);
		await seedIdentityApiToken(other.id, { id: 'tok-theirs', tokenHash: 'hash-theirs' }, db);

		await deleteApiToken(db, user.id, 'tok-theirs');
		await deleteApiToken(db, user.id, 'tok-unknown');
		expect((await db.select().from(apiTokens)).map((row) => row.id).sort()).toEqual([
			'tok-mine',
			'tok-theirs'
		]);

		await deleteApiToken(db, user.id, 'tok-mine');
		expect((await db.select().from(apiTokens)).map((row) => row.id)).toEqual(['tok-theirs']);
	});

	rollbackTest('deleteApiTokensForPerson revokes every token of that person only', async (db) => {
		const user = await seedUser(db);
		const other = await seedUser(db);
		await seedIdentityApiToken(user.id, { id: 'tok-a' }, db);
		await seedIdentityApiToken(user.id, { id: 'tok-b', tokenHash: 'hash-b' }, db);
		await seedIdentityApiToken(other.id, { id: 'tok-other', tokenHash: 'hash-other' }, db);
		expect(await deleteApiTokensForPerson(db, user.id)).toBe(2);
		expect((await db.select().from(apiTokens)).map((row) => row.id)).toEqual(['tok-other']);
	});

	rollbackTest(
		'deleteApiTokenByHash revokes exactly the presented token, scoped to its owner',
		async (db) => {
			const user = await seedUser(db);
			const other = await seedUser(db);
			await seedIdentityApiToken(user.id, { id: 'tok-presented', tokenHash: 'hash-presented' }, db);
			await seedIdentityApiToken(user.id, { id: 'tok-kept', tokenHash: 'hash-kept' }, db);
			await seedIdentityApiToken(other.id, { id: 'tok-theirs', tokenHash: 'hash-theirs' }, db);

			await deleteApiTokenByHash(db, user.id, 'hash-theirs');
			await deleteApiTokenByHash(db, user.id, 'hash-presented');
			expect((await db.select().from(apiTokens)).map((row) => row.id).sort()).toEqual([
				'tok-kept',
				'tok-theirs'
			]);
		}
	);

	rollbackTest('findApiTokenHolder resolves a hash to its token and owner, or null', async (db) => {
		const user = await seedUser(db, { firstName: 'Mia' });
		await seedIdentityApiToken(user.id, { id: 'tok-a', tokenHash: 'hash-a' }, db);

		const holder = await findApiTokenHolder(db, 'hash-a');
		expect(holder?.tokenId).toBe('tok-a');
		expect(holder?.person).toMatchObject({ id: user.id, firstName: 'Mia' });
		expect(Object.keys(holder ?? {}).sort()).toEqual(['person', 'tokenId']);
		expect(await findApiTokenHolder(db, 'hash-unknown')).toBeNull();
	});

	rollbackTest('touchApiTokenLastUsed stamps lastUsedAt on that token only', async (db) => {
		const user = await seedUser(db);
		await seedIdentityApiToken(user.id, { id: 'tok-a' }, db);
		await seedIdentityApiToken(user.id, { id: 'tok-b', tokenHash: 'hash-b' }, db);
		await touchApiTokenLastUsed(db, 'tok-a', NOW);
		const rows = await db.select().from(apiTokens);
		const byId = Object.fromEntries(rows.map((row) => [row.id, row.lastUsedAt?.getTime() ?? null]));
		expect(byId).toEqual({ 'tok-a': NOW.getTime(), 'tok-b': null });
	});
});

describe('email codes', () => {
	rollbackTest('insertEmailCode stores the row as given', async (db) => {
		const key = emailCodeKey({ code: '24681357', email: 'mia@example.com', type: 'login' });
		const row = await insertEmailCode(db, {
			code: key.codeHash,
			email: key.email,
			type: key.type,
			expiresAt: NOW,
			firstName: 'Mia',
			lastName: 'Lopez',
			emailId: 'resend-1'
		});
		expect(row).toMatchObject({
			code: key.codeHash,
			email: 'mia@example.com',
			type: 'login',
			firstName: 'Mia',
			lastName: 'Lopez',
			emailId: 'resend-1',
			pendingEmail: null
		});
		expect(row.expiresAt.getTime()).toBe(NOW.getTime());
	});

	rollbackTest(
		'findEmailCodeByKey needs the digest, the email AND the type to match',
		async (db) => {
			const key = emailCodeKey({ code: '24681357', email: 'mia@example.com', type: 'login' });
			await seedIdentityEmailCode({ code: key.codeHash, email: key.email, type: key.type }, db);

			expect((await findEmailCodeByKey(db, key))?.email).toBe('mia@example.com');
			expect(await findEmailCodeByKey(db, { ...key, email: 'eve@example.com' })).toBeNull();
			expect(await findEmailCodeByKey(db, { ...key, type: 'signup' })).toBeNull();
			expect(
				await findEmailCodeByKey(
					db,
					emailCodeKey({ code: '11111111', email: 'mia@example.com', type: 'login' })
				)
			).toBeNull();
		}
	);

	rollbackTest('deleteEmailCodeByKey deletes only the fully matching row', async (db) => {
		const key = emailCodeKey({ code: '24681357', email: 'mia@example.com', type: 'login' });
		await seedIdentityEmailCode({ code: key.codeHash, email: key.email, type: key.type }, db);
		await seedIdentityEmailCode({ code: 'other-digest', email: key.email, type: 'login' }, db);

		await deleteEmailCodeByKey(db, { ...key, type: 'signup' });
		expect(await db.select().from(codes)).toHaveLength(2);
		await deleteEmailCodeByKey(db, key);
		expect((await db.select().from(codes)).map((row) => row.code)).toEqual(['other-digest']);
	});

	rollbackTest('finds the email-change code and the reset marker by their digests', async (db) => {
		const change = emailCodeKey({
			code: '12345678',
			email: 'mia@example.com',
			type: 'email_change'
		});
		const marker = emailCodeKey({ code: 'used:abc', email: 'mia@example.com', type: 'reset_used' });
		await seedIdentityEmailCode(
			{
				code: change.codeHash,
				email: change.email,
				type: change.type,
				pendingEmail: 'new@example.com'
			},
			db
		);
		await seedIdentityEmailCode(
			{ code: marker.codeHash, email: marker.email, type: marker.type },
			db
		);

		expect((await findEmailCodeByKey(db, change))?.pendingEmail).toBe('new@example.com');
		expect((await findEmailCodeByKey(db, marker))?.type).toBe('reset_used');
		// Q-116: the plaintext is not what the table holds, so it matches nothing.
		expect(await findEmailCodeByKey(db, { ...change, codeHash: '12345678' })).toBeNull();
	});

	rollbackTest('deleteEmailCodesForEmail clears every code of that address only', async (db) => {
		await seedIdentityEmailCode({ code: 'a', email: 'mia@example.com', type: 'login' }, db);
		await seedIdentityEmailCode({ code: 'b', email: 'mia@example.com', type: 'email_change' }, db);
		await seedIdentityEmailCode({ code: 'c', email: 'eve@example.com', type: 'login' }, db);
		await deleteEmailCodesForEmail(db, 'mia@example.com');
		expect((await db.select().from(codes)).map((row) => row.code)).toEqual(['c']);
	});

	rollbackTest('deleteExpiredEmailCodes removes codes expired strictly before now', async (db) => {
		await seedIdentityEmailCode(
			{ code: 'expired', email: 'a@example.com', expiresAt: new Date('2026-04-01T11:59:59.999Z') },
			db
		);
		await seedIdentityEmailCode({ code: 'edge', email: 'a@example.com', expiresAt: NOW }, db);
		await seedIdentityEmailCode(
			{ code: 'live', email: 'a@example.com', expiresAt: new Date('2026-04-01T12:15:00.000Z') },
			db
		);
		expect(await deleteExpiredEmailCodes(db, NOW)).toBe(1);
		expect((await db.select().from(codes)).map((row) => row.code).sort()).toEqual(['edge', 'live']);
	});
});

describe('account bindings', () => {
	rollbackTest('findAccountBinding looks up by providerAccountId, or null', async (db) => {
		const user = await seedUser(db);
		await seedIdentityAccountBinding(user.id, 'mia@example.com', 'email', db);
		expect(await findAccountBinding(db, 'mia@example.com')).toMatchObject({
			userId: user.id,
			provider: 'email',
			providerAccountId: 'mia@example.com'
		});
		expect(await findAccountBinding(db, 'eve@example.com')).toBeNull();
	});

	rollbackTest('insertAccountBinding stores and returns the binding', async (db) => {
		const user = await seedUser(db);
		const row = await insertAccountBinding(db, {
			userId: user.id,
			provider: 'email',
			providerAccountId: 'mia@example.com'
		});
		expect(row).toMatchObject({
			userId: user.id,
			provider: 'email',
			providerAccountId: 'mia@example.com'
		});
		expect(await db.select().from(accounts)).toHaveLength(1);
	});
});
