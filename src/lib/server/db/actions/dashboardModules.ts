import { db } from '$lib/server/db';
import { dashboardModuleSwitches } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { DASHBOARD_MODULES, FAMILY_DASHBOARD_MODULES, type ModuleSwitchMap } from '$lib/dashboardModules';

/** Current family master switches for the family-scoped modules.
 * Missing row → enabled (the default); rows only exist while switched off.
 *
 * The persisted half of visibility. The composed answer lives one layer up, in
 * `dashboardVisibility` — this file reads rows and nothing else (109).
 */
export async function getFamilyModuleSwitches(familyId: string): Promise<ModuleSwitchMap> {
	const rows = await db
		.select({
			module: dashboardModuleSwitches.module,
			enabled: dashboardModuleSwitches.enabled
		})
		.from(dashboardModuleSwitches)
		.where(eq(dashboardModuleSwitches.familyId, familyId));
	const map: ModuleSwitchMap = {};
	for (const { id } of FAMILY_DASHBOARD_MODULES) map[id] = true;
	for (const row of rows) map[row.module] = row.enabled;
	return map;
}

/** Toggle a family master switch. `enabled: false` writes a row; re-enabling
 * removes the row back to the default-on state.
 */
export async function setFamilyModuleSwitch(familyId: string, module: string, enabled: boolean) {
	const found = DASHBOARD_MODULES.find((m) => m.id === module);
	if (!found) throw new Error(`Unknown dashboard module: ${module}`);
	if (found.scope !== 'family') {
		throw new Error(`Module is not family-scoped: ${module}`);
	}
	if (enabled) {
		await db
			.delete(dashboardModuleSwitches)
			.where(
				and(eq(dashboardModuleSwitches.familyId, familyId), eq(dashboardModuleSwitches.module, module))
			);
	} else {
		await db
			.insert(dashboardModuleSwitches)
			.values({ familyId, module, enabled: false })
			.onConflictDoNothing();
	}
}
