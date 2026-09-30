/** Canonical Day Dashboard modules.
 *
 * - `family`-scoped modules can be master-switched off by family admins
 *   (dashboardModuleSwitches) — off hides them for every member.
 * - Every module can be per-user hidden from /account, regardless of scope.
 * - `band` is where the module renders: a quiet info strip above the cards,
 *   or a card in the toggleable band. `meaning` is what its switch now means
 *   to the reader. Both are declared here, once, so the account switches and
 *   the dashboard never tell two stories (080).
 *
 * Moving a module between bands must NOT change its `id` — the id is the saved
 * state, and a user who hid a module before the move stays hidden after it.
 * Retiring a module DOES remove its `id` (103 took the Member Strip off the
 * dashboard), so a saved list still naming it is inert: `isDashboardModule`
 * rejects it, `composeModuleVisibility` drops it, and /account rebuilds the
 * list from this array on the next save, so the stale id clears itself. No
 * data migration is owed to a retired id.
 */
export const DASHBOARD_MODULES = [
	{
		id: 'verse',
		label: 'Daily Verse',
		scope: 'personal',
		band: 'info',
		meaning: 'Show the verse on your Day Dashboard.'
	},
	{ id: 'glance', label: 'Day at a Glance', scope: 'personal', band: 'card', meaning: 'Show today’s events and counts.' },
	{ id: 'top3', label: 'Top 3 Priorities', scope: 'personal', band: 'card', meaning: 'Show the family’s three most urgent tasks.' },
	{ id: 'completed', label: 'Completed Today', scope: 'personal', band: 'card', meaning: 'Show what got finished today.' },
	{ id: 'board', label: 'Family Task Board', scope: 'family', band: 'card', meaning: 'Show the family task board.' },
	{ id: 'kids', label: "Kids' Schedule", scope: 'family', band: 'card', meaning: 'Show today’s kids’ events.' },
	{ id: 'groceries', label: 'Groceries', scope: 'family', band: 'card', meaning: 'Show what’s still on the grocery list.' },
	{ id: 'meals', label: 'Meals', scope: 'family', band: 'card', meaning: 'Show the family meal plan.' }
] as const;

export type DashboardModuleId = (typeof DASHBOARD_MODULES)[number]['id'];

/** Where a Dashboard Module renders: a quiet info strip above the cards, or a
 * card in the toggleable band (080). */
export type DashboardBand = (typeof DASHBOARD_MODULES)[number]['band'];

/** Modules that family admins can master-switch. */
export const FAMILY_DASHBOARD_MODULES = DASHBOARD_MODULES.filter((m) => m.scope === 'family');

/** Modules in the quiet info strip above the cards. A reading, not a task. */
export const INFO_DASHBOARD_MODULES = DASHBOARD_MODULES.filter((m) => m.band === 'info');

/** Modules that render as cards in the toggleable band. */
export const CARD_DASHBOARD_MODULES = DASHBOARD_MODULES.filter((m) => m.band === 'card');

export function isDashboardModule(id: string): id is DashboardModuleId {
	return DASHBOARD_MODULES.some((m) => m.id === id);
}

/** Whether the Daily Verse shows at all.
 *
 * Now that the verse renders as an info strip rather than a band card, its
 * switch means exactly this: show or hide the verse. It reads BOTH persisted
 * facts — the `showDailyVerse` setting and the composed module visibility — so
 * a user who hid the verse before the move is still hidden after it.
 */
export function verseIsVisible(input: {
	showDailyVerse: boolean | null | undefined;
	modules: Record<string, boolean> | undefined;
}): boolean {
	return input.showDailyVerse === true && (input.modules?.verse ?? true);
}
