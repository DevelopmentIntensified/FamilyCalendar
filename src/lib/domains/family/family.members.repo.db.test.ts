/**
 * The members repo against real Postgres: the role lookups, both roster reads
 * (one family, many families), the membership writes and the append-only
 * consent record. Each test runs in `rollbackTest`; writes are given their
 * `now`, so the tests assert the stamped timestamp instead of trusting a clock.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import {
	childConsentRecords,
	familyMembers,
	tasks
} from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedFamily, seedMembership } from './family.fixtures.server';
import {
	deleteMembership,
	findMemberRole,
	findMembership,
	findUserForAdd,
	insertChildConsent,
	insertMembership,
	listRoster,
	listRosterForFamilies,
	updateMemberRole,
	updateMemberType
} from './family.members.repo.server';

describe('findMemberRole', () => {
	rollbackTest('answers the role in THAT family, not in another one the user belongs to', async (db) => {
		const ann = await seedUser(db);
		await seedFamily('fam-a', {}, db);
		await seedFamily('fam-b', {}, db);
		await seedFamily('fam-c', {}, db);
		await seedMembership('fam-a', ann.id, 'creator', 'parent', db);
		await seedMembership('fam-b', ann.id, 'member', 'member', db);

		expect(await findMemberRole(db, ann.id, 'fam-a')).toBe('creator');
		expect(await findMemberRole(db, ann.id, 'fam-b')).toBe('member');
		expect(await findMemberRole(db, ann.id, 'fam-c')).toBeNull();
	});

	rollbackTest('answers null for a user who is not a member and for an unknown family', async (db) => {
		const ann = await seedUser(db);
		const out = await seedUser(db);
		await seedFamily('fam-a', {}, db);
		await seedMembership('fam-a', ann.id, 'admin', 'parent', db);
		expect(await findMemberRole(db, out.id, 'fam-a')).toBeNull();
		expect(await findMemberRole(db, ann.id, 'nope')).toBeNull();
	});
});

describe('findMembership', () => {
	rollbackTest('returns the membership row of that user in that family', async (db) => {
		const ann = await seedUser(db);
		await seedFamily('fam-a', {}, db);
		await seedFamily('fam-b', {}, db);
		await seedMembership('fam-a', ann.id, 'admin', 'child', db);

		expect(await findMembership(db, ann.id, 'fam-a')).toEqual({
			userId: ann.id,
			familyId: 'fam-a',
			role: 'admin',
			memberType: 'child'
		});
		expect(await findMembership(db, ann.id, 'fam-b')).toBeNull();
	});
});

describe('listRoster', () => {
	rollbackTest('joins the users, carrying role and Member Type side by side, for ONE family', async (db) => {
		const ann = await seedUser(db, { firstName: 'Ann', lastName: 'Rivera' });
		const bob = await seedUser(db, { firstName: 'Bob', lastName: 'Stone' });
		const out = await seedUser(db, { firstName: 'Out', lastName: 'Sider' });
		await seedFamily('fam-a', {}, db);
		await seedFamily('fam-b', {}, db);
		await seedMembership('fam-a', ann.id, 'creator', 'parent', db);
		await seedMembership('fam-a', bob.id, 'admin', 'child', db);
		await seedMembership('fam-b', out.id, 'creator', 'parent', db);

		const roster = await listRoster(db, 'fam-a');
		expect([...roster].sort((a, b) => a.userId.localeCompare(b.userId))).toEqual(
			[
				{
					userId: ann.id,
					firstName: 'Ann',
					lastName: 'Rivera',
					email: ann.email,
					role: 'creator',
					memberType: 'parent'
				},
				{
					userId: bob.id,
					firstName: 'Bob',
					lastName: 'Stone',
					email: bob.email,
					role: 'admin',
					memberType: 'child'
				}
			].sort((a, b) => a.userId.localeCompare(b.userId))
		);
	});

	rollbackTest('answers an empty roster for an unknown family', async (db) => {
		expect(await listRoster(db, 'nope')).toEqual([]);
	});
});

describe('listRosterForFamilies', () => {
	rollbackTest('reads every asked family in one go, first-name order, tagged with its family and no email', async (db) => {
		const cid = await seedUser(db, { firstName: 'Cid', lastName: 'Vale' });
		const ann = await seedUser(db, { firstName: 'Ann', lastName: 'Rivera' });
		const bea = await seedUser(db, { firstName: 'Bea', lastName: 'Moss' });
		const out = await seedUser(db, { firstName: 'Out', lastName: 'Sider' });
		await seedFamily('fam-a', {}, db);
		await seedFamily('fam-b', {}, db);
		await seedFamily('fam-c', {}, db);
		await seedMembership('fam-a', cid.id, 'member', 'member', db);
		await seedMembership('fam-a', ann.id, 'creator', 'parent', db);
		await seedMembership('fam-b', bea.id, 'admin', 'child', db);
		await seedMembership('fam-b', ann.id, 'member', 'parent', db);
		await seedMembership('fam-c', out.id, 'creator', 'parent', db);

		const rows = await listRosterForFamilies(db, ['fam-a', 'fam-b']);
		expect(rows).toEqual([
			{ familyId: 'fam-a', userId: ann.id, firstName: 'Ann', lastName: 'Rivera', role: 'creator', memberType: 'parent' },
			{ familyId: 'fam-b', userId: ann.id, firstName: 'Ann', lastName: 'Rivera', role: 'member', memberType: 'parent' },
			{ familyId: 'fam-b', userId: bea.id, firstName: 'Bea', lastName: 'Moss', role: 'admin', memberType: 'child' },
			{ familyId: 'fam-a', userId: cid.id, firstName: 'Cid', lastName: 'Vale', role: 'member', memberType: 'member' }
		]);
	});

	rollbackTest('answers two people who share a first name in the same order on every read', async (db) => {
		const sam1 = await seedUser(db, { firstName: 'Sam' });
		const sam2 = await seedUser(db, { firstName: 'Sam' });
		await seedFamily('fam-a', {}, db);
		await seedMembership('fam-a', sam1.id, 'member', 'member', db);
		await seedMembership('fam-a', sam2.id, 'member', 'member', db);
		const first = await listRosterForFamilies(db, ['fam-a']);
		const second = await listRosterForFamilies(db, ['fam-a']);
		expect(first.map((row) => row.userId).sort()).toEqual([sam1.id, sam2.id].sort());
		expect(second.map((row) => row.userId)).toEqual(first.map((row) => row.userId));
	});

	rollbackTest('answers an empty list for no families', async (db) => {
		expect(await listRosterForFamilies(db, [])).toEqual([]);
	});
});

describe('insertMembership', () => {
	rollbackTest('writes the role and Member Type it is given', async (db) => {
		const ann = await seedUser(db);
		await seedFamily('fam-a', {}, db);
		await insertMembership(db, {
			userId: ann.id,
			familyId: 'fam-a',
			role: 'member',
			memberType: 'child'
		});
		expect(await findMembership(db, ann.id, 'fam-a')).toMatchObject({
			role: 'member',
			memberType: 'child'
		});
	});
});

describe('updateMemberRole', () => {
	rollbackTest('changes the role only, in that family only', async (db) => {
		const ann = await seedUser(db);
		await seedFamily('fam-a', {}, db);
		await seedFamily('fam-b', {}, db);
		await seedMembership('fam-a', ann.id, 'member', 'child', db);
		await seedMembership('fam-b', ann.id, 'member', 'child', db);

		const row = await updateMemberRole(db, 'fam-a', ann.id, 'admin');
		expect(row).toMatchObject({ familyId: 'fam-a', role: 'admin', memberType: 'child' });
		expect(await findMembership(db, ann.id, 'fam-b')).toMatchObject({ role: 'member' });
	});

	rollbackTest('returns null for someone who is not in that family', async (db) => {
		const ann = await seedUser(db);
		await seedFamily('fam-a', {}, db);
		expect(await updateMemberRole(db, 'fam-a', ann.id, 'admin')).toBeNull();
	});
});

describe('updateMemberType', () => {
	rollbackTest('changes the Member Type only, in that family only', async (db) => {
		const ann = await seedUser(db);
		await seedFamily('fam-a', {}, db);
		await seedFamily('fam-b', {}, db);
		await seedMembership('fam-a', ann.id, 'admin', 'member', db);
		await seedMembership('fam-b', ann.id, 'admin', 'member', db);

		const row = await updateMemberType(db, 'fam-a', ann.id, 'parent');
		expect(row).toMatchObject({ familyId: 'fam-a', role: 'admin', memberType: 'parent' });
		expect(await findMembership(db, ann.id, 'fam-b')).toMatchObject({ memberType: 'member' });
	});

	rollbackTest('returns null for someone who is not in that family', async (db) => {
		const ann = await seedUser(db);
		await seedFamily('fam-a', {}, db);
		expect(await updateMemberType(db, 'fam-a', ann.id, 'parent')).toBeNull();
	});
});

describe('deleteMembership', () => {
	rollbackTest('removes the row in that family only and returns it', async (db) => {
		const ann = await seedUser(db);
		const bob = await seedUser(db);
		await seedFamily('fam-a', {}, db);
		await seedFamily('fam-b', {}, db);
		await seedMembership('fam-a', ann.id, 'member', 'member', db);
		await seedMembership('fam-a', bob.id, 'member', 'member', db);
		await seedMembership('fam-b', ann.id, 'member', 'member', db);

		const removed = await deleteMembership(db, 'fam-a', ann.id);
		expect(removed).toMatchObject({ userId: ann.id, familyId: 'fam-a' });
		expect(await findMembership(db, ann.id, 'fam-a')).toBeNull();
		expect(await findMembership(db, ann.id, 'fam-b')).not.toBeNull();
		expect(await findMembership(db, bob.id, 'fam-a')).not.toBeNull();
	});

	rollbackTest('returns null for a non-member: the caller answers a no-op success (Q-027)', async (db) => {
		const out = await seedUser(db);
		await seedFamily('fam-a', {}, db);
		expect(await deleteMembership(db, 'fam-a', out.id)).toBeNull();
	});

	rollbackTest('leaves the removed member\'s tasks alone: un-assigning is the tasks port\'s write', async (db) => {
		const ann = await seedUser(db);
		const bob = await seedUser(db);
		await seedFamily('fam-a', {}, db);
		await seedMembership('fam-a', ann.id, 'creator', 'parent', db);
		await seedMembership('fam-a', bob.id, 'member', 'member', db);
		const [task] = await db
			.insert(tasks)
			.values({
				title: 'Bins',
				userId: ann.id,
				familyId: 'fam-a',
				assignedTo: bob.id,
				assignmentStatus: 'accepted'
			})
			.returning();

		await deleteMembership(db, 'fam-a', bob.id);

		const [after] = await db.select().from(tasks).where(eq(tasks.id, task.id));
		expect([after.assignedTo, after.assignmentStatus]).toEqual([bob.id, 'accepted']);
	});
});

describe('findUserForAdd', () => {
	rollbackTest('returns the account, verified or not', async (db) => {
		const unverified = await seedUser(db, {
			firstName: 'Una',
			lastName: 'Verified',
			emailVerified: false
		});
		expect(await findUserForAdd(db, unverified.id)).toEqual({
			id: unverified.id,
			firstName: 'Una',
			lastName: 'Verified',
			email: unverified.email
		});
	});

	rollbackTest('returns null for an unknown id', async (db) => {
		expect(await findUserForAdd(db, 'nope')).toBeNull();
	});
});

describe('insertChildConsent', () => {
	const now = new Date('2026-11-18T10:00:00.000Z');

	rollbackTest('records who consented for whom, where and when (`now`)', async (db) => {
		const parent = await seedUser(db);
		const child = await seedUser(db);
		await seedFamily('fam-a', {}, db);

		const row = await insertChildConsent(db, {
			childUserId: child.id,
			parentUserId: parent.id,
			familyId: 'fam-a',
			now
		});

		expect(row).toMatchObject({
			childUserId: child.id,
			parentUserId: parent.id,
			familyId: 'fam-a',
			source: 'child-create'
		});
		expect(row.recordedAt.getTime()).toBe(now.getTime());
		const [stored] = await db
			.select()
			.from(childConsentRecords)
			.where(eq(childConsentRecords.id, row.id));
		expect(stored.recordedAt.getTime()).toBe(now.getTime());
	});

	rollbackTest('appends: a second record is a second row, never a replacement', async (db) => {
		const parent = await seedUser(db);
		const child = await seedUser(db);
		await seedFamily('fam-a', {}, db);
		const later = new Date('2026-11-19T10:00:00.000Z');

		await insertChildConsent(db, { childUserId: child.id, parentUserId: parent.id, familyId: 'fam-a', now });
		await insertChildConsent(db, {
			childUserId: child.id,
			parentUserId: parent.id,
			familyId: 'fam-a',
			now: later
		});

		const rows = await db
			.select()
			.from(childConsentRecords)
			.where(eq(childConsentRecords.childUserId, child.id));
		expect(rows.map((row) => row.recordedAt.toISOString()).sort()).toEqual([
			now.toISOString(),
			later.toISOString()
		]);
	});

	rollbackTest('writes no membership: that is insertMembership\'s call', async (db) => {
		const parent = await seedUser(db);
		const child = await seedUser(db);
		await seedFamily('fam-a', {}, db);
		await insertChildConsent(db, { childUserId: child.id, parentUserId: parent.id, familyId: 'fam-a', now });
		const members = await db.select().from(familyMembers).where(eq(familyMembers.familyId, 'fam-a'));
		expect(members).toEqual([]);
	});
});
