/**
 * Row builders for family's db tests. Family-owned rows only (Family, Family
 * Member, invite code); task rows stay local to a test because `tasks` owns
 * task fixtures.
 *
 *   const { ann, bob } = await seedFamilyRoster();            // committed goldens
 *   await seedInvite({ code: 'LIVE000001', familyId: 'fam-1' });
 *   await seedFamily('fam-9', { name: 'Nines' }, db);          // inside rollbackTest
 *
 * Every builder takes an optional trailing `db`. It defaults to the committed
 * test database, which is what the golden's calls rely on; a `rollbackTest`
 * passes its transaction so the rows vanish with it.
 *
 * Doc: ./README.md#how-to-test
 */
import type { Db } from '$lib/kernel/db/database.server';
import {
	families,
	familyInviteCodes,
	familyMembers,
	users,
	type FamilyInviteCodeRow
} from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testDb } from '$lib/kernel/testing/testDb.server';

/** A seeded `users` row, as the module's tests pass it to `invoke` and services. */
export type FamilyTestUser = typeof users.$inferSelect;

export async function seedFamily(
	id: string,
	overrides: { name?: string; color?: string | null; createdAt?: string } = {},
	db: Db = testDb()
) {
	const [row] = await db
		.insert(families)
		.values({
			id,
			name: overrides.name ?? id,
			color: overrides.color ?? null,
			...(overrides.createdAt ? { createdAt: new Date(overrides.createdAt) } : {})
		})
		.returning();
	return row;
}

export async function seedMembership(
	familyId: string,
	userId: string,
	role = 'member',
	memberType = 'member',
	db: Db = testDb()
) {
	await db.insert(familyMembers).values({ familyId, userId, role, memberType });
}

export async function seedInvite(
	overrides: {
		code: string;
		familyId: string;
		expiresAt?: string;
		maxUses?: number | null;
		useCount?: number | null;
		createdBy?: string | null;
	},
	db: Db = testDb()
): Promise<FamilyInviteCodeRow> {
	const [row] = await db
		.insert(familyInviteCodes)
		.values({
			code: overrides.code,
			familyId: overrides.familyId,
			expiresAt: new Date(overrides.expiresAt ?? '2099-01-01T00:00:00.000Z'),
			maxUses: overrides.maxUses === undefined ? 10 : overrides.maxUses,
			useCount: overrides.useCount === undefined ? 0 : overrides.useCount,
			createdBy: overrides.createdBy ?? null
		})
		.returning();
	if (!row) throw new Error('seedInvite: insert returned no row');
	return row;
}

/** ann (creator), bob (admin), cid (member), dee (member), out (not in the family). */
export async function seedFamilyRoster(db: Db = testDb()) {
	const ann = await seedUser(db, { firstName: 'Ann', lastName: 'Rivera' });
	const bob = await seedUser(db, { firstName: 'Bob', lastName: 'Stone' });
	const cid = await seedUser(db, { firstName: 'Cid', lastName: 'Vale' });
	const dee = await seedUser(db, { firstName: 'Dee', lastName: 'Wren' });
	const out = await seedUser(db, { firstName: 'Out', lastName: 'Sider' });
	await seedFamily('fam-1', { name: 'Riveras', color: '#c45e38' }, db);
	await seedMembership('fam-1', ann.id, 'creator', 'parent', db);
	await seedMembership('fam-1', bob.id, 'admin', 'parent', db);
	await seedMembership('fam-1', cid.id, 'member', 'member', db);
	await seedMembership('fam-1', dee.id, 'member', 'member', db);
	return { ann, bob, cid, dee, out };
}

/** A family already at the default plan's 6-member cap (creator + 5, bob is the admin). */
export async function seedFullFamily(db: Db = testDb()) {
	const ann = await seedUser(db, { firstName: 'Ann', lastName: 'Rivera' });
	const bob = await seedUser(db, { firstName: 'Bob', lastName: 'Stone' });
	const members: FamilyTestUser[] = [];
	for (let i = 0; i < 4; i += 1) {
		members.push(await seedUser(db, { firstName: `Member${i}`, lastName: 'Stone' }));
	}
	const out = await seedUser(db, { firstName: 'Out', lastName: 'Sider' });
	await seedFamily('fam-full', { name: 'Full House' }, db);
	await seedMembership('fam-full', ann.id, 'creator', 'parent', db);
	await seedMembership('fam-full', bob.id, 'admin', 'parent', db);
	for (const member of members) await seedMembership('fam-full', member.id, 'member', 'member', db);
	return { ann, bob, members, out };
}
