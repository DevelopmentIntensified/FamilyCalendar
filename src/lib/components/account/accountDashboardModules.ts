import { DASHBOARD_MODULES } from '$lib/dashboardModules';

/**
 * Modules whose Dashboard card exists in the tree but is mounted nowhere.
 *
 * 105 rerun: the approved page badges these rows "parked · not mounted
 * anywhere", because a switch that switches nothing is a lie the reader cannot
 * see through. `MealsCard.svelte` is the case — it is imported by nothing
 * except its own test, and no loader reads the `meals` table — but the module
 * is still in `DASHBOARD_MODULES`, so its row still writes a saved value.
 *
 * Deliberately NOT derived from `DASHBOARD_READS`: `glance`, `top3` and
 * `completed` all read `[]` there too, and all three ARE mounted. An empty
 * read list means "needs no query", not "not rendered". This is the separate
 * fact, declared here.
 */
export const UNMOUNTED_MODULES: ReadonlySet<string> = new Set(['meals']);

/** Does this module's card render anywhere in the app? */
export function isModuleMounted(id: string): boolean {
	return !UNMOUNTED_MODULES.has(id);
}

/**
 * 105: the per-user Dashboard Module switches are their own section with their
 * own action and their own submit, because hiding a dashboard card and changing
 * your week start were one save. This module is the pure part of that split -
 * the show-based checkbox form in, the hidden list out - so the rule is
 * testable without a database and without a form.
 */

/**
 * Show-based form in, hidden list out.
 *
 * An unchecked checkbox is absent from the form, so "absent" is how a module
 * is hidden. Only canonical ids come back: a form carrying an id the module
 * list has retired must not re-create it, or the hidden list grows a value no
 * reader can clear.
 */
export function hiddenModulesFromForm(formData: FormData): string[] {
	const canonical = DASHBOARD_MODULES.map((m) => m.id);
	return canonical.filter((id) => formData.get(`module_${id}`) !== 'on');
}

/**
 * The saved hidden list, as a per-module visibility map.
 *
 * A saved id the list no longer carries is inert (103): it hides nothing.
 */
export function shownModuleIds(
	hidden: readonly string[] | null | undefined
): Record<string, boolean> {
	const hiddenSet = new Set(hidden ?? []);
	return Object.fromEntries(DASHBOARD_MODULES.map(({ id }) => [id, !hiddenSet.has(id)]));
}
