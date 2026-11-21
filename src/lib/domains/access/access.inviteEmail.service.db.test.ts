/**
 * access invite-email against real Postgres: the emailed invite joins an
 * existing account without signing it in, or creates the person (binding,
 * settings, personal calendar, optional password), joins and starts a session;
 * a replayed, revoked or missing invite row joins nothing.
 *
 * Expected values come from the legacy
 * `(marketing)/family/invite/email/+page.server.ts` and its route test
 * (issue 152: the durable single-use row, never a replayable JWT).
 *
 * Doc: ./README.md#invariants
 */
import { TimeSpan } from 'oslo';
import { createJWT } from 'oslo/jwt';
import { describe, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import {
	accounts,
	authSession,
	calendars,
	families,
	familyInviteCodes,
	familyMembers,
	userSettings,
	users
} from '$lib/kernel/db/tables.server';
import type { Db } from '$lib/kernel/db/database.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { SESSION_COOKIE_NAME, verifyPassword } from '$lib/domains/identity/index.server';
import {
	acceptInviteEmail,
	readInviteEmailToken
} from './access.inviteEmail.service.server';

const NOW = '2026-04-01T12:00:00.000Z';
const LATER = new Date('2026-05-01T12:00:00.000Z');

/** One family with a creator, plus the code the email would have carried. */
async function seedInvite(
	db: Db,
	overrides: { code?: string; expiresAt?: Date; maxUses?: number | null; useCount?: number } = {}
) {
	const creator = await seedUser(db, { email: 'creator@example.test' });
	await db.insert(families).values({ id: 'fam-invite', name: 'The Invite Family' });
	const code = overrides.code ?? 'invite-code-1';
	await db.insert(familyInviteCodes).values({
		code,
		familyId: 'fam-invite',
		expiresAt: overrides.expiresAt ?? LATER,
		maxUses: overrides.maxUses === undefined ? 1 : overrides.maxUses,
		useCount: overrides.useCount ?? 0,
		createdBy: creator.id
	});
	return { creator, code };
}

describe('readInviteEmailToken', () => {
	rollbackTest('reads a minted token and refuses a forgery, junk and a shape-less payload', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const secret = new TextEncoder().encode(ctx.config.codePepper);
		const mint = (payload: object, key = secret) =>
			createJWT('HS256', key, payload, {
				headers: { alg: 'HS256', typ: 'JWT' },
				expiresIn: new TimeSpan(1, 'd')
			});

		const claims = {
			email: 'guest@example.test',
			firstName: 'Guest',
			lastName: 'User',
			familyId: 'fam-invite',
			inviteCode: 'invite-code-1'
		};
		expect(await readInviteEmailToken(ctx, await mint(claims))).toEqual(claims);
		expect(
			await readInviteEmailToken(
				ctx,
				await mint(claims, new TextEncoder().encode('another-secret'))
			)
		).toBeNull();
		expect(await readInviteEmailToken(ctx, 'not-a-token')).toBeNull();
		expect(await readInviteEmailToken(ctx, await mint({ email: 'guest@example.test' }))).toBeNull();
	});
});

describe('acceptInviteEmail', () => {
	rollbackTest('joins an existing account without starting a session', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const { code } = await seedInvite(db);
		const existing = await seedUser(db, { email: 'existing@example.test' });

		const result = await acceptInviteEmail(ctx, {
			payload: {
				email: 'existing@example.test',
				firstName: 'Ex',
				lastName: 'Isting',
				familyId: 'fam-invite',
				inviteCode: code
			}
		});

		expect(result).toEqual({ outcome: 'joined-existing' });
		const members = await db
			.select()
			.from(familyMembers)
			.where(eq(familyMembers.userId, existing.id));
		expect(members.map((row) => row.familyId)).toEqual(['fam-invite']);
		const sessions = await db
			.select()
			.from(authSession)
			.where(eq(authSession.userId, existing.id));
		expect(sessions).toEqual([]);
	});

	rollbackTest('refuses a used-up invite without joining', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const { code } = await seedInvite(db, { maxUses: 1, useCount: 1 });
		const existing = await seedUser(db, { email: 'late@example.test' });

		expect(
			await acceptInviteEmail(ctx, {
				payload: {
					email: 'late@example.test',
					firstName: 'Late',
					lastName: 'Person',
					familyId: 'fam-invite',
					inviteCode: code
				}
			})
		).toEqual({ outcome: 'unavailable' });

		const members = await db
			.select()
			.from(familyMembers)
			.where(eq(familyMembers.userId, existing.id));
		expect(members).toEqual([]);
	});

	rollbackTest('creates, joins and signs in a brand-new account', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const { code } = await seedInvite(db);

		const result = await acceptInviteEmail(ctx, {
			payload: {
				email: 'new-person@example.test',
				firstName: 'New',
				lastName: 'Person',
				familyId: 'fam-invite',
				inviteCode: code
			}
		});

		expect(result.outcome).toBe('joined-new');
		if (result.outcome !== 'joined-new') return;
		expect(result.familyId).toBe('fam-invite');
		expect(result.cookie.name).toBe(SESSION_COOKIE_NAME);

		const [person] = await db
			.select()
			.from(users)
			.where(eq(users.email, 'new-person@example.test'));
		expect(person.emailVerified).toBe(true);
		// Legacy `createNewUser`: the `email` account binding and a settings row.
		const bindings = await db.select().from(accounts).where(eq(accounts.userId, person.id));
		expect(bindings.map((row) => row.providerAccountId)).toEqual(['new-person@example.test']);
		const settings = await db
			.select()
			.from(userSettings)
			.where(eq(userSettings.userId, person.id));
		expect(settings).toHaveLength(1);
		const personal = await db.select().from(calendars).where(eq(calendars.ownerId, person.id));
		expect(personal).toHaveLength(1);
		expect(personal[0].familyId).toBeNull();
		const members = await db
			.select()
			.from(familyMembers)
			.where(eq(familyMembers.userId, person.id));
		expect(members.map((row) => row.familyId)).toEqual(['fam-invite']);
		const sessions = await db
			.select()
			.from(authSession)
			.where(eq(authSession.userId, person.id));
		expect(sessions).toHaveLength(1);
	});

	rollbackTest('sets the password the form collected on the new account', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const { code } = await seedInvite(db);

		const result = await acceptInviteEmail(ctx, {
			payload: {
				email: 'password@example.test',
				firstName: 'Pass',
				lastName: 'Word',
				familyId: 'fam-invite',
				inviteCode: code
			},
			password: 'correct horse 8'
		});
		expect(result.outcome).toBe('joined-new');

		const [person] = await db
			.select()
			.from(users)
			.where(eq(users.email, 'password@example.test'));
		expect(person.passwordHash).toBeTruthy();
		expect(await verifyPassword('correct horse 8', person.passwordHash ?? '')).toBe(true);
	});

	rollbackTest('refuses a token without an invite row and creates nothing', async (db) => {
		const ctx = testCtx({ db, now: NOW });

		expect(
			await acceptInviteEmail(ctx, {
				payload: {
					email: 'legacy@example.test',
					firstName: 'Legacy',
					lastName: 'Token',
					familyId: 'fam-invite'
				}
			})
		).toEqual({ outcome: 'unavailable' });

		const rows = await db
			.select()
			.from(users)
			.where(eq(users.email, 'legacy@example.test'));
		expect(rows).toEqual([]);
	});

	rollbackTest('refuses a dead invite row before creating the new account', async (db) => {
		const ctx = testCtx({ db, now: NOW });
		const { code } = await seedInvite(db, { expiresAt: new Date('2026-03-01T00:00:00.000Z') });

		expect(
			await acceptInviteEmail(ctx, {
				payload: {
					email: 'expired@example.test',
					firstName: 'Ex',
					lastName: 'Pired',
					familyId: 'fam-invite',
					inviteCode: code
				}
			})
		).toEqual({ outcome: 'unavailable' });

		const rows = await db
			.select()
			.from(users)
			.where(eq(users.email, 'expired@example.test'));
		expect(rows).toEqual([]);
	});
});
