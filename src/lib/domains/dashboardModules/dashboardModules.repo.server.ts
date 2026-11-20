/**
 * dashboardModules repo: the one table this module owns,
 * `dashboardModuleSwitches`. No authorization and no visibility rule lives
 * here — the composition is `dashboardVisibility` (rules), the admin check and
 * the id validation are the service's.
 *
 * A row exists only while a module is switched OFF: reading seeds every
 * family-scoped id `true` and then applies the rows; writing deletes on enable
 * and inserts on disable.
 *
 * Every write takes the caller's `now` and stamps `createdAt`/`updatedAt`
 * explicitly, so nothing here reads the clock (rule R5). The write shape is a
 * named object rather than positional arguments so the boolean never sits in a
 * bare positional slot. Names are `read`/`write` because the service owns the
 * `list`/`set` names (rule R11: one exported name, one home).
 *
 * Doc: ./README.md#invariants
 */
import { and, eq } from 'drizzle-orm';
import type { Db } from '$lib/kernel/db/database.server';
import { dashboardModuleSwitches } from '$lib/kernel/db/tables.server';
import {
	selectDashboardModules,
	type DashboardModuleId,
	type ModuleSwitchMap
} from './dashboardModules.registry.rules';

/**
 * Current family master switches for the family-scoped modules.
 * Missing row → enabled (the default); rows only exist while switched off.
 *
 * Rows are applied verbatim, including one for an id that is no longer
 * canonical: the composition filters canonical ids, so a stale row is inert
 * rather than fatal (103).
 */
export async function readFamilyModuleSwitches(db: Db, familyId: string): Promise<ModuleSwitchMap> {
	const rows = await db
		.select({
			module: dashboardModuleSwitches.module,
			enabled: dashboardModuleSwitches.enabled
		})
		.from(dashboardModuleSwitches)
		.where(eq(dashboardModuleSwitches.familyId, familyId));
	const switches: ModuleSwitchMap = {};
	for (const { id } of selectDashboardModules({ scope: 'family' })) switches[id] = true;
	for (const row of rows) switches[row.module] = row.enabled;
	return switches;
}

/** One family master switch write: the module has already been validated as a
 * canonical family-scoped id by the service. */
export type FamilyModuleSwitchWrite = {
	readonly familyId: string;
	readonly module: DashboardModuleId;
	readonly enabled: boolean;
	/** Stamps the OFF row; enabling deletes it, so no timestamp is written. */
	readonly now: Date;
};

/**
 * Write a family master switch: `enabled: false` inserts the OFF row (an
 * existing row is kept as it is); `enabled: true` deletes the row, back to the
 * default-on state. The conflict clause only guards a row written outside this
 * action — it never updates one.
 */
export async function writeFamilyModuleSwitch(
	db: Db,
	values: FamilyModuleSwitchWrite
): Promise<void> {
	if (values.enabled) {
		await db
			.delete(dashboardModuleSwitches)
			.where(
				and(
					eq(dashboardModuleSwitches.familyId, values.familyId),
					eq(dashboardModuleSwitches.module, values.module)
				)
			);
		return;
	}
	await db
		.insert(dashboardModuleSwitches)
		.values({
			familyId: values.familyId,
			module: values.module,
			enabled: false,
			createdAt: values.now,
			updatedAt: values.now
		})
		.onConflictDoNothing();
}
