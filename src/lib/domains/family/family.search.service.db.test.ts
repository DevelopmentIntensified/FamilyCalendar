/**
 * family search services against real Postgres: one test per IO Invariant,
 * titled after the rule. Each runs in `rollbackTest`; these use-cases read only
 * family's tables plus the declared `users` join and need no port.
 *
 * Expected values come from `src/lib/server/db/actions/memberSearch.ts` and
 * `searchUsers` in `db/actions/families.ts`, and the frozen golden pins the
 * same answers on the wire.
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedFamily, seedFamilyRoster, seedMembership } from './family.fixtures.server';
import { findInvitableMembers, listFamilyRoster, searchMembers } from './family.search.service.server';

const NOW = '2026-03-01T09:00:00.000Z';

describe('listFamilyRoster', () => {
	rollbackTest('reads one named family and refuses a family you are not in', async (db) => {
		const { bob, out } = await seedFamilyRoster(db);
		const answer = await listFamilyRoster(
			testCtx({ db, now: NOW }),
			actorFromUser(bob, 'session'),
			'fam-1'
		);
		expect(answer.familyId).toBe('fam-1');
		expect(answer.members).toHaveLength(4);

		const stranger = await listFamilyRoster(
			testCtx({ db, now: NOW }),
			actorFromUser(out, 'session'),
			'fam-1'
		).catch((error: unknown) => error);
		expect(stranger).toMatchObject({ status: 403, message: 'Not a member of this family' });
	});

	rollbackTest('defaults to the OLDEST family, never whichever row comes first', async (db) => {
		const ann = await seedUser(db);
		await seedFamily('fam-new', { createdAt: '2026-01-01T00:00:00.000Z' }, db);
		await seedFamily('fam-old', { createdAt: '2025-01-01T00:00:00.000Z' }, db);
		await seedMembership('fam-new', ann.id, 'creator', 'member', db);
		await seedMembership('fam-old', ann.id, 'member', 'member', db);

		const answer = await listFamilyRoster(
			testCtx({ db, now: NOW }),
			actorFromUser(ann, 'session'),
			null
		);
		expect(answer.familyId).toBe('fam-old');
	});

	rollbackTest('answers familyId null and no members when you have no family', async (db) => {
		const ann = await seedUser(db);
		const answer = await listFamilyRoster(
			testCtx({ db, now: NOW }),
			actorFromUser(ann, 'session'),
			null
		);
		expect(answer).toEqual({ familyId: null, members: [] });
	});
});

describe('searchMembers', () => {
	rollbackTest('matches verified prefixes, masks the email and keeps the caller out', async (db) => {
		const caller = await seedUser(db, { firstName: 'Ann', lastName: 'Caller' });
		const target = await seedUser(db, {
			firstName: 'Anna',
			lastName: 'Smith',
			email: 'anna.smith@example.test'
		});
		await seedUser(db, {
			firstName: 'Anna',
			lastName: 'Hidden',
			email: 'anna.hidden@example.test',
			emailVerified: false
		});

		const hits = await searchMembers(testCtx({ db, now: NOW }), actorFromUser(caller, 'session'), {
			q: 'an',
			exclude: []
		});

		expect(hits).toEqual([
			{
				id: target.id,
				firstName: 'Anna',
				lastName: 'Smith',
				email: 'a••••••@e••••••'
			}
		]);
	});

	rollbackTest('removes every excluded id and caps the result at ten rows', async (db) => {
		const caller = await seedUser(db, { firstName: 'Ann', lastName: 'Caller' });
		const excluded = await seedUser(db, { firstName: 'Anna', lastName: 'One' });
		for (let index = 0; index < 12; index += 1) {
			await seedUser(db, { firstName: `Zed${index}`, lastName: 'Stone' });
		}

		const withoutExcluded = await searchMembers(
			testCtx({ db, now: NOW }),
			actorFromUser(caller, 'session'),
			{ q: 'an', exclude: [excluded.id] }
		);
		expect(withoutExcluded.map((hit) => hit.id)).not.toContain(excluded.id);

		const capped = await searchMembers(testCtx({ db, now: NOW }), actorFromUser(caller, 'session'), {
			q: 'zed',
			exclude: []
		});
		expect(capped).toHaveLength(10);
	});

	rollbackTest('refuses a missing, one-character or blank term before any query', async (db) => {
		const caller = await seedUser(db);
		const c = testCtx({ db, now: NOW });
		const actor = actorFromUser(caller, 'session');

		for (const q of ['', 'a', '   ']) {
			const failure = await searchMembers(c, actor, { q, exclude: [] }).catch(
				(error: unknown) => error
			);
			expect(failure).toMatchObject({
				status: 400,
				message: 'Type at least 2 characters to look someone up.'
			});
		}

		const tooLong = await searchMembers(c, actor, { q: 'a'.repeat(61), exclude: [] }).catch(
			(error: unknown) => error
		);
		expect(tooLong).toMatchObject({ status: 400, message: 'That search is too long.' });
	});
});

describe('findInvitableMembers', () => {
	rollbackTest('answers an empty list when q or familyId is missing', async (db) => {
		const caller = await seedUser(db);
		const c = testCtx({ db, now: NOW });
		const actor = actorFromUser(caller, 'session');

		expect(await findInvitableMembers(c, actor, { q: '', familyId: 'fam-1' })).toEqual([]);
		expect(await findInvitableMembers(c, actor, { q: 'ann', familyId: null })).toEqual([]);
	});

	rollbackTest('refuses a family you are not in, even when you belong to another', async (db) => {
		const { out } = await seedFamilyRoster(db);
		await seedFamily('fam-2', {}, db);
		await seedMembership('fam-2', out.id, 'creator', 'member', db);

		const failure = await findInvitableMembers(
			testCtx({ db, now: NOW }),
			actorFromUser(out, 'session'),
			{ q: 'ann', familyId: 'fam-1' }
		).catch((error: unknown) => error);
		expect(failure).toMatchObject({
			status: 403,
			message: 'You do not have permission to search in this family'
		});
	});

	rollbackTest('matches an exact email only, excluding members, unverified accounts and substrings', async (db) => {
		const { ann, cid } = await seedFamilyRoster(db);
		const target = await seedUser(db, {
			firstName: 'Bob',
			lastName: 'Stone',
			email: 'bob.stone@example.test'
		});
		await seedUser(db, {
			firstName: 'Bob',
			lastName: 'Unverified',
			email: 'bob.unverified@example.test',
			emailVerified: false
		});
		const c = testCtx({ db, now: NOW });
		const actor = actorFromUser(ann, 'session');

		const exact = await findInvitableMembers(c, actor, {
			q: 'bob.stone@example.test',
			familyId: 'fam-1'
		});
		expect(exact.map((user) => user.id)).toEqual([target.id]);

		for (const q of ['bob.stone', 'bob.unverified@example.test', cid.email ?? '']) {
			expect(await findInvitableMembers(c, actor, { q, familyId: 'fam-1' })).toEqual([]);
		}
	});

	// Q-028 B (answered 2026-11-12): the term splits into first and last name.
	rollbackTest('finds a full name by splitting it into first and last (Q-028 B)', async (db) => {
		const { ann } = await seedFamilyRoster(db);
		const annLee = await seedUser(db, {
			firstName: 'Ann',
			lastName: 'Lee',
			email: 'ann.lee@example.test'
		});
		const sameBoth = await seedUser(db, {
			firstName: 'Sam',
			lastName: 'Sam',
			email: 'sam.sam@example.test'
		});
		const c = testCtx({ db, now: NOW });
		const actor = actorFromUser(ann, 'session');

		const fullName = await findInvitableMembers(c, actor, { q: 'Ann Lee', familyId: 'fam-1' });
		expect(fullName.map((user) => user.id)).toEqual([annLee.id]);

		// One token keeps the legacy leg: both name columns equal it.
		const identical = await findInvitableMembers(c, actor, { q: 'Sam', familyId: 'fam-1' });
		expect(identical.map((user) => user.id)).toEqual([sameBoth.id]);
	});
});
