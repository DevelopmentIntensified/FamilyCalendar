import { db } from '$lib/server/db';
import { dashboardModuleSwitches } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import {
	DASHBOARD_MODULES,
	FAMILY_DASHBOARD_MODULES,
	isDashboardModule
} from '$lib/dashboardModules';

/** Current family master switches for the family-scoped modules.
 * Missing row → enabled (the default); rows only exist while switched off.
 */
export async function getFamilyModuleSwitches(
	familyId: string
): Promise<Record<string, boolean>> {
	const rows = await db
		.select({
			module: dashboardModuleSwitches.module,
			enabled: dashboardModuleSwitches.enabled
		})
		.from(dashboardModuleSwitches)
		.where(eq(dashboardModuleSwitches.familyId, familyId));
	const map: Record<string, boolean> = {};
	for (const { id } of FAMILY_DASHBOARD_MODULES) map[id] = true;
	for (const row of rows) map[row.module] = row.enabled;
	return map;
}

/** Effective visibility for a viewer: family master switch (family modules
 * only) AND the user's own hidden list both apply. Personal modules are only
 * ever gated by the user's own hidden list.
 */
export function composeModuleVisibility(
	familySwitches: Record<string, boolean>,
	hiddenModules: string[]
): Record<string, boolean> {
	const hidden = new Set(hiddenModules.filter(isDashboardModule));
	const out: Record<string, boolean> = {};
	for (const { id, scope } of DASHBOARD_MODULES) {
		const master = scope === 'family' ? (familySwitches[id] ?? true) : true;
		out[id] = master && !hidden.has(id);
	}
	return out;
}

/** Toggle a family master switch. `enabled: false` writes a row; re-enabling
 * removes the row back to the default-on state.
 */
export async function setFamilyModuleSwitch(
	familyId: string,
	module: string,
	enabled: boolean
) {
	const found = DASHBOARD_MODULES.find((m) => m.id === module);
	if (!found) throw new Error(`Unknown dashboard module: ${module}`);
	if (found.scope !== 'family') {
		throw new Error(`Module is not family-scoped: ${module}`);
	}
	if (enabled) {
		await db
			.delete(dashboardModuleSwitches)
			.where(
				and(
					eq(dashboardModuleSwitches.familyId, familyId),
					eq(dashboardModuleSwitches.module, module)
				)
			);
	} else {
		await db
			.insert(dashboardModuleSwitches)
			.values({ familyId, module, enabled: false })
			.onConflictDoNothing();
	}
}