/**
 * Row builders for family's db tests. Family-owned rows only (Family, Family
 * Member, invite code); task rows stay local to a test because `tasks` owns
 * task fixtures.
 *
 *   const { ann, bob } = await seedFamilyRoster();
 *   await seedInvite({ code: 'LIVE000001', familyId: 'fam-1' });
 *
 * Doc: ./README.md#how-to-test
 */
import {
	families,
	familyInviteCodes,
	familyMembers,
	users
} from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testDb } from '$lib/kernel/testing/testDb.server';

/** A seeded `users` row, as the module's tests pass it to `invoke` and services. */
export type FamilyTestUser = typeof users.$inferSelect;

export async function seedFamily(
	id: string,
	overrides: { name?: string; color?: string | null; createdAt?: string } = {}
) {
	const [row] = await testDb()
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
	memberType = 'member'
) {
	await testDb().insert(familyMembers).values({ familyId, userId, role, memberType });
}

export async function seedInvite(overrides: {
	code: string;
	familyId: string;
	expiresAt?: string;
	maxUses?: number | null;
	useCount?: number | null;
	createdBy?: string | null;
}) {
	await testDb()
		.insert(familyInviteCodes)
		.values({
			code: overrides.code,
			familyId: overrides.familyId,
			expiresAt: new Date(overrides.expiresAt ?? '2099-01-01T00:00:00.000Z'),
			maxUses: overrides.maxUses === undefined ? 10 : overrides.maxUses,
			useCount: overrides.useCount === undefined ? 0 : overrides.useCount,
			createdBy: overrides.createdBy ?? null
		});
}

/** ann (creator), bob (admin), cid (member), dee (member), out (not in the family). */
export async function seedFamilyRoster() {
	const ann = await seedUser(testDb(), { firstName: 'Ann', lastName: 'Rivera' });
	const bob = await seedUser(testDb(), { firstName: 'Bob', lastName: 'Stone' });
	const cid = await seedUser(testDb(), { firstName: 'Cid', lastName: 'Vale' });
	const dee = await seedUser(testDb(), { firstName: 'Dee', lastName: 'Wren' });
	const out = await seedUser(testDb(), { firstName: 'Out', lastName: 'Sider' });
	await seedFamily('fam-1', { name: 'Riveras', color: '#c45e38' });
	await seedMembership('fam-1', ann.id, 'creator', 'parent');
	await seedMembership('fam-1', bob.id, 'admin', 'parent');
	await seedMembership('fam-1', cid.id, 'member');
	await seedMembership('fam-1', dee.id, 'member');
	return { ann, bob, cid, dee, out };
}

/** A family already at the default plan's 6-member cap (creator + 5, bob is the admin). */
export async function seedFullFamily() {
	const ann = await seedUser(testDb(), { firstName: 'Ann', lastName: 'Rivera' });
	const bob = await seedUser(testDb(), { firstName: 'Bob', lastName: 'Stone' });
	const members: FamilyTestUser[] = [];
	for (let i = 0; i < 4; i += 1) {
		members.push(await seedUser(testDb(), { firstName: `Member${i}`, lastName: 'Stone' }));
	}
	const out = await seedUser(testDb(), { firstName: 'Out', lastName: 'Sider' });
	await seedFamily('fam-full', { name: 'Full House' });
	await seedMembership('fam-full', ann.id, 'creator', 'parent');
	await seedMembership('fam-full', bob.id, 'admin', 'parent');
	for (const member of members) await seedMembership('fam-full', member.id, 'member');
	return { ann, bob, members, out };
}
