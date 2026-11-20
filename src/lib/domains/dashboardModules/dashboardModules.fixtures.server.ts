/**
 * Row builders for dashboardModules' db tests: a family with one member at a
 * given role and a persisted switch row. Kernel seeds only users; a
 * dashboard-modules test never writes `familyMembers` by hand.
 *
 * `seedFamilySwitch` inserts directly (not through the repo) so a test can
 * start from the OFF state the read is supposed to apply.
 *
 * Doc: ./README.md#how-to-test
 */
import type { Db } from '$lib/kernel/db/database.server';
import { dashboardModuleSwitches, families, familyMembers } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';

/** A family member's role — the only three the switch route can see. Local: family owns the vocabulary. */
type FamilyRole = 'creator' | 'admin' | 'member';

/** A person, a family, and their membership in it at `role`. */
export async function seedFamilyWithRole(db: Db, role: FamilyRole) {
	const user = await seedUser(db);
	const [family] = await db.insert(families).values({ name: 'Test family' }).returning();
	if (!family) throw new Error('seedFamilyWithRole: insert returned no row');
	await db.insert(familyMembers).values({ userId: user.id, familyId: family.id, role });
	return { user, family };
}

/**
 * One persisted switch row for a family. `module` is a plain string so a test
 * can seed a stale id; real writes go through the repo, which types it.
 */
export async function seedFamilySwitch(
	db: Db,
	values: { familyId: string; module: string; enabled?: boolean }
) {
	const [row] = await db
		.insert(dashboardModuleSwitches)
		.values({
			familyId: values.familyId,
			module: values.module,
			enabled: values.enabled ?? false
		})
		.returning();
	if (!row) throw new Error('seedFamilySwitch: insert returned no row');
	return row;
}
