/**
 * The families repo against real Postgres: the membership read (order, labels,
 * roster summary), the write of a family with its day-one roster, the rename,
 * the grouped open-task count and the oldest-family lookup. Each test runs in
 * `rollbackTest`, so the rows it seeds vanish afterwards. Writes are given
 * their `now`, so the tests assert the stamped timestamps instead of trusting
 * a clock.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import type { Db } from '$lib/kernel/db/database.server';
import { families, familyMembers, tasks } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedFamily, seedMembership } from './family.fixtures.server';
import {
	countOpenFamilyTasks,
	findFamilyById,
	findMembershipFamilyId,
	insertFamilyWithRoster,
	listMemberships,
	updateFamilyRow
} from './family.families.repo.server';

/** A task row; `tasks` owns task fixtures, so this stays local to the one query that reads them. */
async function insertTask(
	db: Db,
	overrides: {
		title: string;
		userId: string;
		familyId: string | null;
		completedAt?: string | null;
		archivedAt?: string | null;
	}
) {
	await db.insert(tasks).values({
		title: overrides.title,
		userId: overrides.userId,
		familyId: overrides.familyId,
		completedAt: overrides.completedAt ?? null,
		archivedAt: overrides.archivedAt ?? null
	});
}

describe('listMemberships', () => {
	rollbackTest('lists the user\'s families oldest first, whatever order they were joined in', async (db) => {
		const ann = await seedUser(db, { firstName: 'Ann' });
		await seedFamily('fam-new', { name: 'Newer', createdAt: '2026-06-01T00:00:00.000Z' }, db);
		await seedFamily('fam-old', { name: 'Older', createdAt: '2024-01-01T00:00:00.000Z' }, db);
		await seedFamily('fam-mid', { name: 'Middle', createdAt: '2025-03-01T00:00:00.000Z' }, db);
		// Joined newest-first, so insertion order is the opposite of the answer.
		await seedMembership('fam-new', ann.id, 'member', 'member', db);
		await seedMembership('fam-mid', ann.id, 'member', 'member', db);
		await seedMembership('fam-old', ann.id, 'member', 'member', db);

		const rows = await listMemberships(db, ann.id);
		expect(rows.map((row) => row.family.id)).toEqual(['fam-old', 'fam-mid', 'fam-new']);
		expect(rows[0].family.createdAt.toISOString()).toBe('2024-01-01T00:00:00.000Z');
	});

	rollbackTest('carries the viewer\'s own role and Member Type for each family, not another member\'s', async (db) => {
		const ann = await seedUser(db, { firstName: 'Ann' });
		const bob = await seedUser(db, { firstName: 'Bob' });
		await seedFamily('fam-a', { name: 'A', color: '#4d9c85', createdAt: '2025-01-01T00:00:00.000Z' }, db);
		await seedFamily('fam-b', { name: 'B', createdAt: '2025-02-01T00:00:00.000Z' }, db);
		await seedMembership('fam-a', ann.id, 'member', 'child', db);
		await seedMembership('fam-a', bob.id, 'creator', 'parent', db);
		await seedMembership('fam-b', ann.id, 'creator', 'parent', db);

		const rows = await listMemberships(db, ann.id);
		expect(rows.map((row) => [row.family.name, row.family.color, row.role, row.memberType])).toEqual([
			['A', '#4d9c85', 'member', 'child'],
			['B', null, 'creator', 'parent']
		]);
	});

	rollbackTest('counts the whole roster and lists every member\'s id and first name in first-name order', async (db) => {
		const cid = await seedUser(db, { firstName: 'Cid' });
		const ann = await seedUser(db, { firstName: 'Ann' });
		const bob = await seedUser(db, { firstName: 'Bob' });
		const stranger = await seedUser(db, { firstName: 'Zed' });
		await seedFamily('fam-1', { name: 'Riveras' }, db);
		await seedFamily('fam-2', { name: 'Elsewhere' }, db);
		await seedMembership('fam-1', cid.id, 'member', 'member', db);
		await seedMembership('fam-1', ann.id, 'creator', 'parent', db);
		await seedMembership('fam-1', bob.id, 'member', 'member', db);
		await seedMembership('fam-2', stranger.id, 'creator', 'parent', db);

		const [row] = await listMemberships(db, cid.id);
		expect(row.memberCount).toBe(3);
		expect(row.members).toEqual([
			{ firstName: 'Ann', userId: ann.id },
			{ firstName: 'Bob', userId: bob.id },
			{ firstName: 'Cid', userId: cid.id }
		]);
	});

	// Q-023 B: the aggregated pair carries the real id, so a shared first name
	// is not mistaken for the same person.
	rollbackTest('keeps each member\'s own id when two share a first name (Q-023 B)', async (db) => {
		const viewer = await seedUser(db, { firstName: 'Ann' });
		const samOne = await seedUser(db, { firstName: 'Sam', lastName: 'One' });
		const samTwo = await seedUser(db, { firstName: 'Sam', lastName: 'Two' });
		await seedFamily('fam-1', { name: 'Riveras' }, db);
		await seedMembership('fam-1', viewer.id, 'creator', 'parent', db);
		await seedMembership('fam-1', samOne.id, 'member', 'member', db);
		await seedMembership('fam-1', samTwo.id, 'member', 'member', db);

		const [row] = await listMemberships(db, viewer.id);
		expect(row.members.map((member) => member.firstName)).toEqual(['Ann', 'Sam', 'Sam']);
		expect(row.members.map((member) => member.userId).sort()).toEqual(
			[viewer.id, samOne.id, samTwo.id].sort()
		);
	});

	rollbackTest('keeps one row per family however many families and members there are', async (db) => {
		const ann = await seedUser(db, { firstName: 'Ann' });
		const bob = await seedUser(db, { firstName: 'Bob' });
		for (const [id, createdAt] of [
			['fam-1', '2025-01-01T00:00:00.000Z'],
			['fam-2', '2025-02-01T00:00:00.000Z'],
			['fam-3', '2025-03-01T00:00:00.000Z']
		] as const) {
			await seedFamily(id, { createdAt }, db);
			await seedMembership(id, ann.id, 'creator', 'parent', db);
			await seedMembership(id, bob.id, 'member', 'member', db);
		}

		const rows = await listMemberships(db, ann.id);
		expect(rows.map((row) => [row.family.id, row.memberCount, row.members])).toEqual([
			['fam-1', 2, [{ firstName: 'Ann', userId: ann.id }, { firstName: 'Bob', userId: bob.id }]],
			['fam-2', 2, [{ firstName: 'Ann', userId: ann.id }, { firstName: 'Bob', userId: bob.id }]],
			['fam-3', 2, [{ firstName: 'Ann', userId: ann.id }, { firstName: 'Bob', userId: bob.id }]]
		]);
	});

	rollbackTest('answers an empty list for a user with no family', async (db) => {
		const loner = await seedUser(db);
		const other = await seedUser(db);
		await seedFamily('fam-1', {}, db);
		await seedMembership('fam-1', other.id, 'creator', 'parent', db);
		expect(await listMemberships(db, loner.id)).toEqual([]);
	});
});

describe('findFamilyById', () => {
	rollbackTest('returns the family row', async (db) => {
		await seedFamily('fam-1', { name: 'Riveras', color: '#c45e38', createdAt: '2025-05-05T05:05:05.000Z' }, db);
		const family = await findFamilyById(db, 'fam-1');
		expect(family).toMatchObject({ id: 'fam-1', name: 'Riveras', color: '#c45e38' });
		expect(family?.createdAt.toISOString()).toBe('2025-05-05T05:05:05.000Z');
	});

	rollbackTest('returns null for an unknown id', async (db) => {
		expect(await findFamilyById(db, 'nope')).toBeNull();
	});
});

describe('insertFamilyWithRoster', () => {
	const now = new Date('2026-11-18T09:30:00.000Z');

	rollbackTest('writes the family at `now`, the creator as creator and each pick as a plain member', async (db) => {
		const ann = await seedUser(db, { firstName: 'Ann' });
		const bob = await seedUser(db, { firstName: 'Bob' });
		const cid = await seedUser(db, { firstName: 'Cid' });

		const family = await insertFamilyWithRoster(db, {
			id: 'fam-new',
			name: 'Riveras',
			color: '#c45e38',
			creatorId: ann.id,
			memberIds: [bob.id, cid.id],
			now
		});

		expect(family).toMatchObject({ id: 'fam-new', name: 'Riveras', color: '#c45e38' });
		expect(family.createdAt.getTime()).toBe(now.getTime());
		const [stored] = await db.select().from(families).where(eq(families.id, 'fam-new'));
		expect(stored.createdAt.getTime()).toBe(now.getTime());
		const members = await db
			.select()
			.from(familyMembers)
			.where(eq(familyMembers.familyId, 'fam-new'));
		expect(
			[...members]
				.sort((a, b) => a.userId.localeCompare(b.userId))
				.map((m) => [m.userId, m.role, m.memberType])
		).toEqual(
			[
				[ann.id, 'creator', 'member'],
				[bob.id, 'member', 'member'],
				[cid.id, 'member', 'member']
			].sort((a, b) => a[0].localeCompare(b[0]))
		);
	});

	rollbackTest('writes the creator alone when nobody was picked', async (db) => {
		const ann = await seedUser(db);
		await insertFamilyWithRoster(db, {
			id: 'fam-solo',
			name: 'Solo',
			color: '#c45e38',
			creatorId: ann.id,
			memberIds: [],
			now
		});
		const members = await db
			.select()
			.from(familyMembers)
			.where(eq(familyMembers.familyId, 'fam-solo'));
		expect(members.map((m) => [m.userId, m.role])).toEqual([[ann.id, 'creator']]);
	});
});

describe('updateFamilyRow', () => {
	rollbackTest('renames without touching the colour', async (db) => {
		await seedFamily('fam-1', { name: 'Old', color: '#c45e38' }, db);
		const row = await updateFamilyRow(db, 'fam-1', { name: 'New' });
		expect(row).toMatchObject({ id: 'fam-1', name: 'New', color: '#c45e38' });
		expect(await findFamilyById(db, 'fam-1')).toMatchObject({ name: 'New', color: '#c45e38' });
	});

	rollbackTest('recolours without touching the name, and accepts any hex (Q-025)', async (db) => {
		await seedFamily('fam-1', { name: 'Keep', color: '#c45e38' }, db);
		const row = await updateFamilyRow(db, 'fam-1', { color: '#000001' });
		expect(row).toMatchObject({ name: 'Keep', color: '#000001' });
	});

	rollbackTest('changes both fields together and only the named family', async (db) => {
		await seedFamily('fam-1', { name: 'One', color: '#c45e38' }, db);
		await seedFamily('fam-2', { name: 'Two', color: '#4d9c85' }, db);
		await updateFamilyRow(db, 'fam-1', { name: 'Uno', color: '#5b9fb5' });
		expect(await findFamilyById(db, 'fam-1')).toMatchObject({ name: 'Uno', color: '#5b9fb5' });
		expect(await findFamilyById(db, 'fam-2')).toMatchObject({ name: 'Two', color: '#4d9c85' });
	});

	rollbackTest('returns null for an unknown id', async (db) => {
		expect(await updateFamilyRow(db, 'nope', { name: 'x' })).toBeNull();
	});
});

describe('countOpenFamilyTasks', () => {
	rollbackTest('counts only tasks that are neither completed nor archived, per family', async (db) => {
		const ann = await seedUser(db);
		await seedFamily('fam-1', {}, db);
		await seedFamily('fam-2', {}, db);
		await seedFamily('fam-3', {}, db);
		await insertTask(db, { title: 'open 1', userId: ann.id, familyId: 'fam-1' });
		await insertTask(db, { title: 'open 2', userId: ann.id, familyId: 'fam-1' });
		await insertTask(db, {
			title: 'done',
			userId: ann.id,
			familyId: 'fam-1',
			completedAt: '2026-02-01T00:00:00.000Z'
		});
		await insertTask(db, {
			title: 'archived only',
			userId: ann.id,
			familyId: 'fam-1',
			archivedAt: '2026-02-01T00:00:00.000Z'
		});
		await insertTask(db, {
			title: 'done and archived',
			userId: ann.id,
			familyId: 'fam-1',
			completedAt: '2026-02-01T00:00:00.000Z',
			archivedAt: '2026-02-02T00:00:00.000Z'
		});
		await insertTask(db, { title: 'other family', userId: ann.id, familyId: 'fam-2' });
		await insertTask(db, {
			title: 'only done here',
			userId: ann.id,
			familyId: 'fam-3',
			completedAt: '2026-02-01T00:00:00.000Z'
		});

		const counts = await countOpenFamilyTasks(db, ['fam-1', 'fam-2', 'fam-3']);
		expect([...counts.entries()].sort()).toEqual([
			['fam-1', 2],
			['fam-2', 1]
		]);
	});

	rollbackTest('ignores families that were not asked for and tasks without a family', async (db) => {
		const ann = await seedUser(db);
		await seedFamily('fam-1', {}, db);
		await seedFamily('fam-2', {}, db);
		await insertTask(db, { title: 'asked', userId: ann.id, familyId: 'fam-1' });
		await insertTask(db, { title: 'not asked', userId: ann.id, familyId: 'fam-2' });
		await insertTask(db, { title: 'personal', userId: ann.id, familyId: null });

		const counts = await countOpenFamilyTasks(db, ['fam-1']);
		expect([...counts.entries()]).toEqual([['fam-1', 1]]);
	});

	rollbackTest('answers an empty map for no families', async (db) => {
		const counts = await countOpenFamilyTasks(db, []);
		expect(counts.size).toBe(0);
	});
});

describe('findMembershipFamilyId', () => {
	rollbackTest('answers the oldest of the user\'s own families, not the first joined', async (db) => {
		const ann = await seedUser(db);
		const other = await seedUser(db);
		// An older family the user is NOT in must never win.
		await seedFamily('fam-ancient', { createdAt: '2020-01-01T00:00:00.000Z' }, db);
		await seedMembership('fam-ancient', other.id, 'creator', 'parent', db);
		await seedFamily('fam-new', { createdAt: '2026-01-01T00:00:00.000Z' }, db);
		await seedFamily('fam-old', { createdAt: '2024-01-01T00:00:00.000Z' }, db);
		await seedMembership('fam-new', ann.id, 'creator', 'parent', db);
		await seedMembership('fam-old', ann.id, 'member', 'member', db);

		expect(await findMembershipFamilyId(db, ann.id)).toBe('fam-old');
	});

	rollbackTest('answers the only family for a single-family user', async (db) => {
		const ann = await seedUser(db);
		await seedFamily('fam-1', {}, db);
		await seedMembership('fam-1', ann.id, 'creator', 'parent', db);
		expect(await findMembershipFamilyId(db, ann.id)).toBe('fam-1');
	});

	rollbackTest('answers null for a user with no family', async (db) => {
		const loner = await seedUser(db);
		expect(await findMembershipFamilyId(db, loner.id)).toBeNull();
	});
});
