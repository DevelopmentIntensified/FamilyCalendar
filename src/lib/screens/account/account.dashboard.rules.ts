/**
 * The Dashboard section's pure part: the registry rows split into the approved
 * page's two bands, and the one fact the page adds to the registry — which
 * modules have no Dashboard card mounted anywhere.
 *
 * 105 rerun: the approved page badges an unmounted row "parked · not mounted
 * anywhere", because a switch that switches nothing is a lie the reader cannot
 * see through. `meals` is the case: its card was deleted (owner Q-002) and no
 * loader reads the `meals` table, but the module stays in `DASHBOARD_MODULES`
 * (so `/api/dashboard` keeps its key) and its row still writes a saved value.
 *
 * The fact is deliberately NOT derived from a read list: `glance`, `top3` and
 * `completed` read no rows either and all three ARE mounted. It is a separate
 * declaration, and it belongs with dashboardModules' registry — declared here
 * until that module exports it (report ASK).
 *
 * Doc: ./README.md#invariants
 */
import {
	DASHBOARD_MODULES,
	selectDashboardModules,
	type DashboardModule
} from '$lib/domains/dashboardModules';

/** Modules with no Dashboard card mounted anywhere. */
export const ACCOUNT_UNMOUNTED_MODULE_IDS: Readonly<Record<string, true>> = { meals: true };

/** Does this module's card render anywhere in the app? */
export function isAccountModuleMounted(id: string): boolean {
	return ACCOUNT_UNMOUNTED_MODULE_IDS[id] !== true;
}

/** The approved page's two headings, in order: the quiet strip, then the cards. */
export const ACCOUNT_DASHBOARD_GROUPS: readonly {
	readonly band: string;
	readonly modules: readonly DashboardModule[];
}[] = [
	{ band: 'Above your cards', modules: selectDashboardModules({ band: 'info' }) },
	{ band: 'Cards', modules: selectDashboardModules({ band: 'card' }) }
];

/** One switch row as the section renders it: registry copy plus the mounted fact. */
export type AccountDashboardModule = {
	readonly id: string;
	readonly label: string;
	readonly scope: string;
	readonly band: string;
	readonly meaning: string;
	readonly mounted: boolean;
};

/** The registry rows as the account section lists them. */
export function accountDashboardModules(): AccountDashboardModule[] {
	return ACCOUNT_DASHBOARD_GROUPS.flatMap((group) =>
		group.modules.map((module) => ({
			id: module.id,
			label: module.label,
			scope: module.scope,
			band: module.band,
			meaning: module.meaning,
			mounted: isAccountModuleMounted(module.id)
		}))
	);
}

/**
 * Show-based form in, hidden list out (105): every checkbox named `module_<id>`
 * that is not `'on'` is hidden, in the registry's own order — so the stored list
 * is a pure function of which canonical ids were named, and a form carrying a
 * retired id cannot grow it. The form is the parsed one (`AccountDashboardModulesForm`),
 * where an absent box reads `''`.
 */
export function accountHiddenModulesFromForm(form: Readonly<Record<string, string>>): string[] {
	return DASHBOARD_MODULES.map((module) => module.id).filter(
		(id) => form[`module_${id}`] !== 'on'
	);
}

/**
 * The saved hidden list as a per-module visibility map. A saved id the registry
 * no longer carries hides nothing (103): absent is visible.
 */
export function accountModuleVisibility(
	hidden: readonly string[] | null | undefined
): Record<string, boolean> {
	const hiddenSet = new Set(hidden ?? []);
	return Object.fromEntries(DASHBOARD_MODULES.map(({ id }) => [id, !hiddenSet.has(id)]));
}
