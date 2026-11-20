/**
 * The invites repo against real Postgres: the code reads (one family, many
 * families, one code, the locked read), mint, revoke, the DB-side use bump and
 * the roster-size count. Each test runs in `rollbackTest`. The repo never
 * compares a code against a clock (`isInviteUsable` does, in the service), so
 * the reads are tested to return expired and used-up codes untouched.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq, sql } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import type { Db } from '$lib/kernel/db/database.server';
import { familyInviteCodes } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedFamily, seedInvite, seedMembership } from './family.fixtures.server';
import {
	countFamilyMembers,
	deleteInviteCode,
	findInviteCode,
	findInviteCodeForUpdate,
	incrementInviteUse,
	insertInviteCode,
	listInviteCodes,
	listInviteCodesForFamilies
} from './family.invites.repo.server';

/** The table-level lock modes this transaction's own backend holds on `familyInviteCodes`. */
async function inviteTableLockModes(db: Db): Promise<string[]> {
	const rows = await db.execute<{ mode: string }>(
		sql`SELECT mode FROM pg_locks
			WHERE pid = pg_backend_pid()
				AND locktype = 'relation'
				AND relation = '"familyInviteCodes"'::regclass`
	);
	return rows.map((row) => row.mode);
}

describe('listInviteCodes', () => {
	rollbackTest('lists every code of THAT family, expired and used-up ones included', async (db) => {
		const ann = await seedUser(db);
		await seedFamily('fam-a', {}, db);
		await seedFamily('fam-b', {}, db);
		await seedInvite({ code: 'LIVE000001', familyId: 'fam-a', createdBy: ann.id }, db);
		await seedInvite({ code: 'EXPIRED001', familyId: 'fam-a', expiresAt: '2000-01-01T00:00:00.000Z' }, db);
		await seedInvite({ code: 'USEDUP0001', familyId: 'fam-a', maxUses: 1, useCount: 1 }, db);
		await seedInvite({ code: 'UNCAPPED01', familyId: 'fam-a', maxUses: null }, db);
		await seedInvite({ code: 'OTHERFAM01', familyId: 'fam-b' }, db);

		const rows = await listInviteCodes(db, 'fam-a');
		expect(rows.map((row) => row.code).sort()).toEqual([
			'EXPIRED001',
			'LIVE000001',
			'UNCAPPED01',
			'USEDUP0001'
		]);
		const uncapped = rows.find((row) => row.code === 'UNCAPPED01');
		expect(uncapped?.maxUses).toBeNull();
		expect(rows.find((row) => row.code === 'LIVE000001')?.createdBy).toBe(ann.id);
	});

	rollbackTest('answers an empty list for a family with no code', async (db) => {
		await seedFamily('fam-a', {}, db);
		expect(await listInviteCodes(db, 'fam-a')).toEqual([]);
	});
});

describe('listInviteCodesForFamilies', () => {
	rollbackTest('reads the codes of every asked family and no other', async (db) => {
		await seedFamily('fam-a', {}, db);
		await seedFamily('fam-b', {}, db);
		await seedFamily('fam-c', {}, db);
		await seedInvite({ code: 'CODEA00001', familyId: 'fam-a' }, db);
		await seedInvite({ code: 'CODEB00001', familyId: 'fam-b' }, db);
		await seedInvite({ code: 'CODEB00002', familyId: 'fam-b', expiresAt: '2000-01-01T00:00:00.000Z' }, db);
		await seedInvite({ code: 'CODEC00001', familyId: 'fam-c' }, db);

		const rows = await listInviteCodesForFamilies(db, ['fam-a', 'fam-b']);
		expect(rows.map((row) => [row.familyId, row.code]).sort()).toEqual([
			['fam-a', 'CODEA00001'],
			['fam-b', 'CODEB00001'],
			['fam-b', 'CODEB00002']
		]);
	});

	rollbackTest('answers an empty list for no families', async (db) => {
		expect(await listInviteCodesForFamilies(db, [])).toEqual([]);
	});
});

describe('findInviteCode', () => {
	rollbackTest('finds a code by its exact text, usable or not', async (db) => {
		await seedFamily('fam-a', {}, db);
		await seedInvite({ code: 'LIVE000001', familyId: 'fam-a' }, db);
		await seedInvite({ code: 'EXPIRED001', familyId: 'fam-a', expiresAt: '2000-01-01T00:00:00.000Z' }, db);
		await seedInvite({ code: 'USEDUP0001', familyId: 'fam-a', maxUses: 1, useCount: 1 }, db);

		expect(await findInviteCode(db, 'LIVE000001')).toMatchObject({ familyId: 'fam-a', maxUses: 10, useCount: 0 });
		// The rule, not the SQL, decides these are dead: the row is still returned.
		expect((await findInviteCode(db, 'EXPIRED001'))?.expiresAt.toISOString()).toBe('2000-01-01T00:00:00.000Z');
		expect(await findInviteCode(db, 'USEDUP0001')).toMatchObject({ maxUses: 1, useCount: 1 });
	});

	rollbackTest('is exact: a prefix, other case or padding is not the code', async (db) => {
		await seedFamily('fam-a', {}, db);
		await seedInvite({ code: 'LIVE000001', familyId: 'fam-a' }, db);
		expect(await findInviteCode(db, 'LIVE0000')).toBeNull();
		expect(await findInviteCode(db, 'live000001')).toBeNull();
		expect(await findInviteCode(db, ' LIVE000001')).toBeNull();
		expect(await findInviteCode(db, '')).toBeNull();
	});
});

describe('findInviteCodeForUpdate', () => {
	rollbackTest('returns the same row as the plain read, expired or not', async (db) => {
		await seedFamily('fam-a', {}, db);
		await seedInvite({ code: 'EXPIRED001', familyId: 'fam-a', expiresAt: '2000-01-01T00:00:00.000Z' }, db);
		expect(await findInviteCodeForUpdate(db, 'EXPIRED001')).toEqual(await findInviteCode(db, 'EXPIRED001'));
		expect(await findInviteCodeForUpdate(db, 'nope')).toBeNull();
	});

	rollbackTest('takes a row lock (FOR UPDATE) where the plain read takes none', async (db) => {
		await seedFamily('fam-a', {}, db);
		await seedInvite({ code: 'LIVE000001', familyId: 'fam-a' }, db);

		// The seed's insert holds RowExclusiveLock; only SELECT ... FOR UPDATE adds RowShareLock.
		await findInviteCode(db, 'LIVE000001');
		expect(await inviteTableLockModes(db)).not.toContain('RowShareLock');

		await findInviteCodeForUpdate(db, 'LIVE000001');
		expect(await inviteTableLockModes(db)).toContain('RowShareLock');
	});
});

describe('insertInviteCode', () => {
	const expiresAt = new Date('2026-11-25T09:30:00.000Z');

	rollbackTest('stores the code with its expiry and cap, a use count of 0 and its minter', async (db) => {
		const ann = await seedUser(db);
		await seedFamily('fam-a', {}, db);

		const row = await insertInviteCode(db, {
			code: 'MINTED0001',
			familyId: 'fam-a',
			expiresAt,
			maxUses: 3,
			createdBy: ann.id
		});

		expect(row).toMatchObject({
			code: 'MINTED0001',
			familyId: 'fam-a',
			maxUses: 3,
			useCount: 0,
			createdBy: ann.id
		});
		expect(row.expiresAt.getTime()).toBe(expiresAt.getTime());
		const [stored] = await db
			.select()
			.from(familyInviteCodes)
			.where(eq(familyInviteCodes.code, 'MINTED0001'));
		expect(stored.expiresAt.getTime()).toBe(expiresAt.getTime());
	});

	rollbackTest('stores the cap it is given, never the column default of 1', async (db) => {
		await seedFamily('fam-a', {}, db);
		const row = await insertInviteCode(db, {
			code: 'MINTED0002',
			familyId: 'fam-a',
			expiresAt,
			maxUses: 10,
			createdBy: null
		});
		expect([row.maxUses, row.createdBy]).toEqual([10, null]);
	});
});

describe('deleteInviteCode', () => {
	rollbackTest('removes that one code and returns it', async (db) => {
		await seedFamily('fam-a', {}, db);
		await seedInvite({ code: 'GONE000001', familyId: 'fam-a' }, db);
		await seedInvite({ code: 'KEEP000001', familyId: 'fam-a' }, db);

		const removed = await deleteInviteCode(db, 'GONE000001');
		expect(removed).toMatchObject({ code: 'GONE000001', familyId: 'fam-a' });
		expect(await findInviteCode(db, 'GONE000001')).toBeNull();
		expect(await findInviteCode(db, 'KEEP000001')).not.toBeNull();
	});

	rollbackTest('returns null for an unknown code', async (db) => {
		expect(await deleteInviteCode(db, 'nope')).toBeNull();
	});
});

describe('incrementInviteUse', () => {
	rollbackTest('adds one use in the database, however stale the caller\'s read is', async (db) => {
		await seedFamily('fam-a', {}, db);
		await seedInvite({ code: 'LIVE000001', familyId: 'fam-a', maxUses: 10, useCount: 2 }, db);
		const stale = await findInviteCode(db, 'LIVE000001');
		expect(stale?.useCount).toBe(2);

		const first = await incrementInviteUse(db, 'LIVE000001');
		const second = await incrementInviteUse(db, 'LIVE000001');

		expect(first?.useCount).toBe(3);
		expect(second?.useCount).toBe(4);
		expect((await findInviteCode(db, 'LIVE000001'))?.useCount).toBe(4);
	});

	rollbackTest('counts a NULL use count up from zero instead of leaving it NULL', async (db) => {
		await seedFamily('fam-a', {}, db);
		await seedInvite({ code: 'NULLCOUNT1', familyId: 'fam-a', maxUses: 1, useCount: null }, db);
		expect((await incrementInviteUse(db, 'NULLCOUNT1'))?.useCount).toBe(1);
	});

	rollbackTest('touches only the named code and leaves the cap alone', async (db) => {
		await seedFamily('fam-a', {}, db);
		await seedInvite({ code: 'SPEND00001', familyId: 'fam-a', maxUses: 5, useCount: 0 }, db);
		await seedInvite({ code: 'OTHER00001', familyId: 'fam-a', maxUses: 5, useCount: 0 }, db);

		await incrementInviteUse(db, 'SPEND00001');

		expect(await findInviteCode(db, 'SPEND00001')).toMatchObject({ useCount: 1, maxUses: 5 });
		expect(await findInviteCode(db, 'OTHER00001')).toMatchObject({ useCount: 0, maxUses: 5 });
	});

	rollbackTest('returns null for an unknown code', async (db) => {
		expect(await incrementInviteUse(db, 'nope')).toBeNull();
	});
});

describe('countFamilyMembers', () => {
	rollbackTest('counts the members of THAT family only', async (db) => {
		const ann = await seedUser(db);
		const bob = await seedUser(db);
		const cid = await seedUser(db);
		await seedFamily('fam-a', {}, db);
		await seedFamily('fam-b', {}, db);
		await seedFamily('fam-empty', {}, db);
		await seedMembership('fam-a', ann.id, 'creator', 'parent', db);
		await seedMembership('fam-a', bob.id, 'member', 'member', db);
		await seedMembership('fam-b', cid.id, 'creator', 'parent', db);

		expect(await countFamilyMembers(db, 'fam-a')).toBe(2);
		expect(await countFamilyMembers(db, 'fam-b')).toBe(1);
		expect(await countFamilyMembers(db, 'fam-empty')).toBe(0);
		expect(await countFamilyMembers(db, 'nope')).toBe(0);
	});
});
