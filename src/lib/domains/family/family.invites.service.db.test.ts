/**
 * family invites services against real Postgres: one test per IO Invariant,
 * titled after the rule. Each runs in `rollbackTest` and takes a plain
 * `testCtx({ db, now })` — these use-cases cross no module boundary.
 *
 * Expected values come from `src/lib/server/db/actions/families.ts` (`generateInviteCode`,
 * `verifyInviteCode`, `acceptInvite`) and the frozen golden.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import { familyInviteCodes, familyMembers } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedFamily, seedFamilyRoster, seedFullFamily, seedInvite, seedMembership } from './family.fixtures.server';
import {
	joinFamily,
	listInvites,
	mintInvite,
	previewInvite,
	revokeInvite
} from './family.invites.service.server';

const NOW = '2026-03-01T09:00:00.000Z';
const DAY_MS = 86_400_000;

describe('mintInvite', () => {
	rollbackTest('mints a ten-use, seven-day code by default and returns its join path', async (db) => {
		const { ann } = await seedFamilyRoster(db);
		const minted = await mintInvite(
			testCtx({ db, now: NOW }),
			actorFromUser(ann, 'session'),
			{ familyId: 'fam-1' }
		);

		expect(minted.code).toMatch(/^[a-z0-9]{10}$/);
		expect(minted.inviteUrl).toBe(`/family/join/${minted.code}`);
		expect(minted.expiresAt.getTime() - Date.parse(NOW)).toBe(7 * DAY_MS);
		const [row] = await db
			.select()
			.from(familyInviteCodes)
			.where(eq(familyInviteCodes.code, minted.code));
		expect([row.maxUses, row.useCount, row.createdBy]).toEqual([10, 0, ann.id]);
	});

	rollbackTest('clamps validity to 1–30 days and uses to 1–50, numeric strings included', async (db) => {
		const { ann } = await seedFamilyRoster(db);
		const c = testCtx({ db, now: NOW });
		const actor = actorFromUser(ann, 'session');

		const max = await mintInvite(c, actor, { familyId: 'fam-1', expiresInDays: 100, maxUses: 999 });
		const min = await mintInvite(c, actor, { familyId: 'fam-1', expiresInDays: '0', maxUses: '0' });
		const strings = await mintInvite(c, actor, {
			familyId: 'fam-1',
			expiresInDays: '3',
			maxUses: '3'
		});

		expect(max.expiresAt.getTime() - Date.parse(NOW)).toBe(30 * DAY_MS);
		expect(min.expiresAt.getTime() - Date.parse(NOW)).toBe(1 * DAY_MS);
		const rows = await db.select().from(familyInviteCodes);
		const uses = (code: string) => rows.find((row) => row.code === code)?.maxUses;
		expect([uses(max.code), uses(min.code), uses(strings.code)]).toEqual([50, 1, 3]);
	});

	rollbackTest("refuses a non-member and a plain member with the mint door's own copy", async (db) => {
		const { cid, out } = await seedFamilyRoster(db);

		const stranger = await mintInvite(testCtx({ db, now: NOW }), actorFromUser(out, 'session'), {
			familyId: 'fam-1'
		}).catch((error: unknown) => error);
		expect(stranger).toMatchObject({
			status: 403,
			message: 'You are not a member of this family'
		});

		const plain = await mintInvite(testCtx({ db, now: NOW }), actorFromUser(cid, 'session'), {
			familyId: 'fam-1'
		}).catch((error: unknown) => error);
		expect(plain).toMatchObject({
			status: 403,
			message: 'Only the family creator or an admin can create invitations'
		});
		expect(await db.select().from(familyInviteCodes)).toEqual([]);
	});
});

describe('listInvites', () => {
	rollbackTest('answers one 404 for a non-member and hides the codes from a plain member', async (db) => {
		const { ann, cid, out } = await seedFamilyRoster(db);
		await seedFamily('fam-2', {}, db);
		await seedMembership('fam-2', out.id, 'creator', db);
		await seedInvite({ code: 'SECRET0001', familyId: 'fam-1' }, db);

		const elsewhere = await listInvites(
			testCtx({ db, now: NOW }),
			actorFromUser(ann, 'session'),
			'fam-2'
		).catch((error: unknown) => error);
		expect(elsewhere).toMatchObject({ status: 404, message: 'Family not found' });

		const plain = await listInvites(
			testCtx({ db, now: NOW }),
			actorFromUser(cid, 'session'),
			'fam-1'
		);
		expect(plain.canManageInvites).toBe(false);
		expect(plain.codes).toEqual([]);

		const creator = await listInvites(
			testCtx({ db, now: NOW }),
			actorFromUser(ann, 'session'),
			'fam-1'
		);
		expect(creator.canManageInvites).toBe(true);
		expect(creator.codes.map((row) => row.code)).toEqual(['SECRET0001']);
	});
});

describe('revokeInvite', () => {
	rollbackTest('answers a blank code, an unknown code, then the family gate, then deletes', async (db) => {
		const { ann, cid, out } = await seedFamilyRoster(db);
		await seedInvite({ code: 'LIVE000001', familyId: 'fam-1' }, db);
		const c = testCtx({ db, now: NOW });

		const blank = await revokeInvite(c, actorFromUser(ann, 'session'), '').catch(
			(error: unknown) => error
		);
		expect(blank).toMatchObject({ status: 400, message: 'Invite code is required' });

		const unknown = await revokeInvite(c, actorFromUser(ann, 'session'), 'NOPE').catch(
			(error: unknown) => error
		);
		expect(unknown).toMatchObject({ status: 404, message: 'Invite code not found' });

		const stranger = await revokeInvite(c, actorFromUser(out, 'session'), 'LIVE000001').catch(
			(error: unknown) => error
		);
		expect(stranger).toMatchObject({ status: 403, message: 'You are not a member of this family' });

		const plain = await revokeInvite(c, actorFromUser(cid, 'session'), 'LIVE000001').catch(
			(error: unknown) => error
		);
		expect(plain).toMatchObject({
			status: 403,
			message: 'Only the family creator or an admin can revoke invitations'
		});

		await revokeInvite(c, actorFromUser(ann, 'session'), 'LIVE000001');
		expect(await db.select().from(familyInviteCodes)).toEqual([]);
	});
});

describe('previewInvite', () => {
	rollbackTest('answers the family and whether the caller is already in it, without spending a use', async (db) => {
		const { ann, out } = await seedFamilyRoster(db);
		await seedInvite({ code: 'LIVE000001', familyId: 'fam-1', useCount: 0, maxUses: 10 }, db);
		const c = testCtx({ db, now: NOW });

		const anonymous = await previewInvite(c, null, 'LIVE000001');
		expect(anonymous.family).toMatchObject({ id: 'fam-1', name: 'Riveras' });
		expect(anonymous.isAlreadyMember).toBe(false);

		const member = await previewInvite(c, actorFromUser(ann, 'session'), 'LIVE000001');
		expect(member.isAlreadyMember).toBe(true);

		const stranger = await previewInvite(c, actorFromUser(out, 'session'), 'LIVE000001');
		expect(stranger.isAlreadyMember).toBe(false);

		const [row] = await db
			.select()
			.from(familyInviteCodes)
			.where(eq(familyInviteCodes.code, 'LIVE000001'));
		expect(row.useCount).toBe(0);
	});

	rollbackTest('answers one 404 for unknown, expired and used-up codes', async (db) => {
		await seedFamily('fam-1', {}, db);
		await seedInvite({ code: 'EXPIRED001', familyId: 'fam-1', expiresAt: '2000-01-01T00:00:00.000Z' }, db);
		await seedInvite({ code: 'USEDUP0001', familyId: 'fam-1', maxUses: 1, useCount: 1 }, db);
		const c = testCtx({ db, now: NOW });

		for (const code of ['NOPE', 'EXPIRED001', 'USEDUP0001']) {
			const failure = await previewInvite(c, null, code).catch((error: unknown) => error);
			expect(failure).toMatchObject({ status: 404, message: 'Invalid or expired invite code' });
		}
	});
});

describe('joinFamily', () => {
	rollbackTest('adds the member and bumps use_count DB-side in one locked transaction', async (db) => {
		await seedFamilyRoster(db);
		const joiner = await seedUser(db, { firstName: 'Joiner', lastName: 'Nine' });
		await seedInvite({ code: 'LIVE000001', familyId: 'fam-1', useCount: 2, maxUses: 5 }, db);

		await joinFamily(testCtx({ db, now: NOW }), actorFromUser(joiner, 'session'), 'LIVE000001');

		const [member] = await db
			.select()
			.from(familyMembers)
			.where(eq(familyMembers.userId, joiner.id));
		expect([member.role, member.memberType]).toEqual(['member', 'member']);
		const [invite] = await db
			.select()
			.from(familyInviteCodes)
			.where(eq(familyInviteCodes.code, 'LIVE000001'));
		expect(invite.useCount).toBe(3);
	});

	rollbackTest('answers one 400 for unknown, expired, used-up and already-joined codes', async (db) => {
		const { ann } = await seedFamilyRoster(db);
		await seedInvite({ code: 'EXPIRED001', familyId: 'fam-1', expiresAt: '2000-01-01T00:00:00.000Z' }, db);
		await seedInvite({ code: 'USEDUP0001', familyId: 'fam-1', maxUses: 1, useCount: 1 }, db);
		await seedInvite({ code: 'MEMBER0001', familyId: 'fam-1' }, db);
		const c = testCtx({ db, now: NOW });
		const joiner = await seedUser(db);

		for (const [user, code] of [
			[joiner, 'NOPE'],
			[joiner, 'EXPIRED001'],
			[joiner, 'USEDUP0001'],
			[ann, 'MEMBER0001']
		] as const) {
			const failure = await joinFamily(c, actorFromUser(user, 'session'), code).catch(
				(error: unknown) => error
			);
			expect(failure).toMatchObject({
				status: 400,
				message: 'Invalid, expired, or already used invite code'
			});
		}
	});

	rollbackTest('answers 403 when the family is at its member limit', async (db) => {
		const { out } = await seedFullFamily(db);
		await seedInvite({ code: 'FULLINVITE', familyId: 'fam-full' }, db);

		const failure = await joinFamily(
			testCtx({ db, now: NOW }),
			actorFromUser(out, 'session'),
			'FULLINVITE'
		).catch((error: unknown) => error);

		expect(failure).toMatchObject({
			status: 403,
			message: 'This family is full. The subscription member limit does not allow more members.'
		});
		expect(
			await db.select().from(familyMembers).where(eq(familyMembers.userId, out.id))
		).toEqual([]);
	});
});
