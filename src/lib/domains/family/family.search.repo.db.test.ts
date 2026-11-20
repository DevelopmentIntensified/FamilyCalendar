/**
 * The search repo against real Postgres: the picker's bounded prefix search,
 * the invite flow's exact lookup and the verified-account check. These two
 * doors must never merge, so each test holds one of them to the property that
 * tells it apart from the other (prefix vs exact, caller excluded vs family
 * excluded). Each test runs in `rollbackTest`.
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedFamily, seedMembership } from './family.fixtures.server';
import {
	findInvitableUsers,
	findVerifiedUsersByPrefix,
	listVerifiedUserIds,
	prefixSearchQuery
} from './family.search.repo.server';
import { MEMBER_SEARCH_ROW_CAP } from './family.search.rules';

const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id).sort();

describe('findVerifiedUsersByPrefix', () => {
	rollbackTest('matches the first name, last name or email by PREFIX, case-insensitively', async (db) => {
		const byFirst = await seedUser(db, { firstName: 'Annabel', lastName: 'Zed', email: 'zz1@x.test' });
		const byLast = await seedUser(db, { firstName: 'Bo', lastName: 'Annan', email: 'zz2@x.test' });
		const byEmail = await seedUser(db, { firstName: 'Cy', lastName: 'Dee', email: 'ann.lee@x.test' });
		await seedUser(db, { firstName: 'Joanna', lastName: 'Banner', email: 'zz3@x.test' });

		const hits = await findVerifiedUsersByPrefix(db, { term: 'ANN', excludeUserIds: [] });

		// 'Joanna' and 'Banner' contain "ann" but do not start with it.
		expect(ids(hits)).toEqual(ids([byFirst, byLast, byEmail]));
	});

	rollbackTest('returns the full address: masking is the service\'s call', async (db) => {
		const ann = await seedUser(db, { firstName: 'Annabel', email: 'annabel@example.test' });
		const [hit] = await findVerifiedUsersByPrefix(db, { term: 'annab', excludeUserIds: [] });
		expect(hit).toEqual({
			id: ann.id,
			firstName: 'Annabel',
			lastName: ann.lastName,
			email: 'annabel@example.test'
		});
	});

	rollbackTest('finds verified accounts only: unverified and never-verified ones are invisible', async (db) => {
		const verified = await seedUser(db, { firstName: 'Verity', emailVerified: true });
		await seedUser(db, { firstName: 'Verna', emailVerified: false });
		await seedUser(db, { firstName: 'Vera', emailVerified: null });

		const hits = await findVerifiedUsersByPrefix(db, { term: 'ver', excludeUserIds: [] });
		expect(ids(hits)).toEqual([verified.id]);
	});

	rollbackTest('leaves out every excluded id (the caller and anyone already picked)', async (db) => {
		const caller = await seedUser(db, { firstName: 'Sally' });
		const picked = await seedUser(db, { firstName: 'Sam' });
		const free = await seedUser(db, { firstName: 'Sasha' });

		const hits = await findVerifiedUsersByPrefix(db, {
			term: 'sa',
			excludeUserIds: [caller.id, picked.id]
		});
		expect(ids(hits)).toEqual([free.id]);
	});

	rollbackTest('treats % and _ in the term as literal characters, not wildcards', async (db) => {
		const literal = await seedUser(db, { firstName: '50%_off', email: 'lit@x.test' });
		await seedUser(db, { firstName: '500 off', email: 'plain@x.test' });
		await seedUser(db, { firstName: 'Anyone', email: 'any@x.test' });

		expect(ids(await findVerifiedUsersByPrefix(db, { term: '50%', excludeUserIds: [] }))).toEqual([literal.id]);
		expect(ids(await findVerifiedUsersByPrefix(db, { term: '50%_', excludeUserIds: [] }))).toEqual([literal.id]);
		// A bare wildcard would be a full scan; escaped, it matches nobody here.
		expect(await findVerifiedUsersByPrefix(db, { term: '%%', excludeUserIds: [] })).toEqual([]);
		expect(await findVerifiedUsersByPrefix(db, { term: '_n', excludeUserIds: [] })).toEqual([]);
	});

	rollbackTest('caps the rows it will ever return', async (db) => {
		for (let i = 0; i < MEMBER_SEARCH_ROW_CAP + 3; i += 1) {
			await seedUser(db, { firstName: `Capped${i}` });
		}
		const hits = await findVerifiedUsersByPrefix(db, { term: 'capped', excludeUserIds: [] });
		expect(hits).toHaveLength(MEMBER_SEARCH_ROW_CAP);
	});

	rollbackTest('runs with an empty exclusion list', async (db) => {
		const ann = await seedUser(db, { firstName: 'Anneke' });
		expect(ids(await findVerifiedUsersByPrefix(db, { term: 'anne', excludeUserIds: [] }))).toEqual([ann.id]);
	});

	rollbackTest('asks for no ordering (an order would leak more than a match does) and a row cap', async (db) => {
		const { sql, params } = prefixSearchQuery(db, {
			term: 'ann',
			excludeUserIds: ['caller']
		}).toSQL();
		expect(sql).not.toMatch(/order by/i);
		expect(sql).toMatch(/limit/i);
		expect(params).toContain(MEMBER_SEARCH_ROW_CAP);
		expect(params).toContain('ann%');
		expect(params).not.toContain('%ann%');
	});
});

describe('findInvitableUsers', () => {
	rollbackTest('matches an exact email, case-insensitively, and nothing shorter or longer', async (db) => {
		const target = await seedUser(db, { firstName: 'Tess', email: 'tess@example.test' });
		await seedUser(db, { firstName: 'Tessa', email: 'tess@example.test.au' });
		await seedUser(db, { firstName: 'Other', email: 'xtess@example.test' });
		await seedFamily('fam-a', {}, db);

		const exact = await findInvitableUsers(db, {
			familyId: 'fam-a',
			email: '  TESS@Example.Test ',
			firstName: '  TESS@Example.Test ',
			lastName: '  TESS@Example.Test '
		});
		expect(ids(exact)).toEqual([target.id]);

		for (const partial of ['tess@', 'ess@example.test', 'tess@example']) {
			expect(
				await findInvitableUsers(db, {
					familyId: 'fam-a',
					email: partial,
					firstName: partial,
					lastName: partial
				})
			).toEqual([]);
		}
	});

	rollbackTest('returns the full address: the invite goes to the real one', async (db) => {
		const target = await seedUser(db, { firstName: 'Tess', lastName: 'Ng', email: 'tess@example.test' });
		await seedFamily('fam-a', {}, db);
		const [hit] = await findInvitableUsers(db, {
			familyId: 'fam-a',
			email: 'tess@example.test',
			firstName: 'tess@example.test',
			lastName: 'tess@example.test'
		});
		expect(hit).toEqual({ id: target.id, firstName: 'Tess', lastName: 'Ng', email: 'tess@example.test' });
	});

	rollbackTest('matches a person whose first AND last name both equal their terms, not either alone', async (db) => {
		const ann = await seedUser(db, { firstName: 'Ann', lastName: 'Lee', email: 'ann@x.test' });
		await seedUser(db, { firstName: 'Ann', lastName: 'Park', email: 'ann2@x.test' });
		await seedUser(db, { firstName: 'Bea', lastName: 'Lee', email: 'bea@x.test' });
		await seedFamily('fam-a', {}, db);

		const split = await findInvitableUsers(db, {
			familyId: 'fam-a',
			email: 'ann lee',
			firstName: 'ann',
			lastName: 'LEE'
		});
		expect(ids(split)).toEqual([ann.id]);
	});

	rollbackTest('today\'s legs (the whole query against both name columns) find only a twin name', async (db) => {
		const twin = await seedUser(db, { firstName: 'Lee', lastName: 'Lee', email: 'twin@x.test' });
		await seedUser(db, { firstName: 'Ann', lastName: 'Lee', email: 'ann@x.test' });
		await seedFamily('fam-a', {}, db);

		const whole = (query: string) => ({
			familyId: 'fam-a',
			email: query,
			firstName: query,
			lastName: query
		});
		expect(ids(await findInvitableUsers(db, whole('lee')))).toEqual([twin.id]);
		expect(await findInvitableUsers(db, whole('Ann Lee'))).toEqual([]);
	});

	rollbackTest('leaves out members of THAT family but not members of another', async (db) => {
		const member = await seedUser(db, { firstName: 'Mem', email: 'mem@x.test' });
		const elsewhere = await seedUser(db, { firstName: 'Else', email: 'else@x.test' });
		await seedFamily('fam-a', {}, db);
		await seedFamily('fam-b', {}, db);
		await seedMembership('fam-a', member.id, 'member', 'member', db);
		await seedMembership('fam-b', elsewhere.id, 'creator', 'parent', db);

		const lookup = (email: string) => ({
			familyId: 'fam-a',
			email,
			firstName: email,
			lastName: email
		});
		expect(await findInvitableUsers(db, lookup('mem@x.test'))).toEqual([]);
		expect(ids(await findInvitableUsers(db, lookup('else@x.test')))).toEqual([elsewhere.id]);
	});

	rollbackTest('finds verified accounts only', async (db) => {
		await seedUser(db, { firstName: 'Una', email: 'una@x.test', emailVerified: false });
		await seedUser(db, { firstName: 'Nul', email: 'nul@x.test', emailVerified: null });
		await seedFamily('fam-a', {}, db);
		for (const email of ['una@x.test', 'nul@x.test']) {
			expect(
				await findInvitableUsers(db, { familyId: 'fam-a', email, firstName: email, lastName: email })
			).toEqual([]);
		}
	});

	rollbackTest('treats % and _ as literal characters: a wildcard is not a scan', async (db) => {
		await seedUser(db, { firstName: 'Ann', email: 'ann@x.test' });
		await seedFamily('fam-a', {}, db);
		for (const term of ['%', '%%', '_nn@x.test', 'ann@x.tes_']) {
			expect(
				await findInvitableUsers(db, { familyId: 'fam-a', email: term, firstName: term, lastName: term })
			).toEqual([]);
		}
	});

	rollbackTest('caps the rows it will ever return', async (db) => {
		for (let i = 0; i < MEMBER_SEARCH_ROW_CAP + 2; i += 1) {
			await seedUser(db, { firstName: 'Sam', lastName: 'Sam' });
		}
		await seedFamily('fam-a', {}, db);
		const hits = await findInvitableUsers(db, {
			familyId: 'fam-a',
			email: 'sam',
			firstName: 'sam',
			lastName: 'sam'
		});
		expect(hits).toHaveLength(MEMBER_SEARCH_ROW_CAP);
	});
});

describe('listVerifiedUserIds', () => {
	rollbackTest('answers the verified accounts among the ids, and omits unknown and unverified ones', async (db) => {
		const verified = await seedUser(db, { emailVerified: true });
		const unverified = await seedUser(db, { emailVerified: false });
		const neverVerified = await seedUser(db, { emailVerified: null });
		const notAsked = await seedUser(db, { emailVerified: true });

		const found = await listVerifiedUserIds(db, [
			verified.id,
			unverified.id,
			neverVerified.id,
			'who-dis'
		]);
		expect([...found]).toEqual([verified.id]);
		expect(found.has(notAsked.id)).toBe(false);
	});

	rollbackTest('answers an empty set for no ids', async (db) => {
		expect((await listVerifiedUserIds(db, [])).size).toBe(0);
	});
});
