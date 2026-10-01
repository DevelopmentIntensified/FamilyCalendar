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
 * rejects it, `dashboardVisibility` drops it, and /account rebuilds the list
 * from this array on the next save, so the stale id clears itself. No data
 * migration is owed to a retired id.
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

/** Module id → visible. Only canonical ids appear; anything unlisted is
 * defaulted to visible by {@link showsModule}. */
export type ModuleSwitchMap = Record<string, boolean>;

/** The stated default for a module the map says nothing about: VISIBLE (109).
 *
 * Absent is not hidden. A module whose entry never reaches the client — a
 * loader that did not compose, an id that is not canonical — must not silently
 * blank a card the reader asked to see.
 */
export function showsModule(modules: ModuleSwitchMap | undefined | null, id: string): boolean {
	return (modules?.[id] ?? true) !== false;
}

/** An expensive read a Dashboard Module justifies paying for (109).
 *
 * Declared with the module that consumes it, so a loader asks "may I skip
 * this read?" instead of re-deriving which cards feed which SELECT. A read
 * with no visible module behind it is work nobody will ever look at.
 */
export type DashboardRead =
	| 'verse'
	| 'familyTasks'
	| 'familyRoster'
	| 'familyDayEvents'
	| 'kidsAttendance'
	| 'groceries';

/** Which reads each module consumes. One entry per read; the vocabulary is
 * declared once, here, so the dashboard loader's skip rules stop being a
 * private detail of one loader. */
export const DASHBOARD_READS: Record<DashboardModuleId, readonly DashboardRead[]> = {
	// The verse has a persisted fact of its own (showDailyVerse) on top of the
	// composition — see dashboardVisibility.
	verse: ['verse'],
	// Day at a Glance lists family events alongside the viewer's own.
	glance: ['familyDayEvents'],
	// Top 3 ranks the viewer's own tasks; Completed Today counts them.
	top3: [],
	completed: [],
	// The board lists every open family task, grouped by assignee — which takes
	// the family roster as well.
	board: ['familyTasks', 'familyRoster'],
	// Kids' Schedule is the family's day events filtered to child attendees, so
	// it wants the roster and the attendance rows, not the whole task board.
	kids: ['familyDayEvents', 'familyRoster', 'kidsAttendance'],
	groceries: ['groceries'],
	// The meal plan is not loaded by the dashboard yet.
	meals: []
};

/** What a loader, a page, or a component needs to know about one viewer.
 *
 * One answer, three questions. Callers stopped asking for "these two booleans"
 * (and each inventing their own rollup of them) after 109; this is the whole
 * surface, and every site derives its answer from here.
 */
export interface DashboardVisibility {
	/** Canonical module id → visible to this viewer. Every id is present, so a
	 * payload can carry this map to a component verbatim. */
	readonly modules: Record<DashboardModuleId, boolean>;
	/** Is this module visible to this viewer? */
	shows(id: string): boolean;
	/** Can the loader skip this read? True while some visible module still
	 * consumes it. */
	needs(read: DashboardRead): boolean;
}

/** The viewer's effective Dashboard Module visibility, composed once (109).
 *
 * Family master switch (family-scoped modules only) AND the viewer's own
 * hidden list both apply. Personal modules are only ever gated by the hidden
 * list. The Daily Verse additionally reads the calendar's own `showDailyVerse`
 * setting — it is the one module whose visibility is a function of a second
 * persisted fact, and it is why this function takes `settings` as one object:
 * the two facts arrive together or not at all.
 *
 * Pure. It touches no database, so the same answer serves a loader, a page
 * payload, and a component.
 */
export function dashboardVisibility(input: {
	/** The settings row, or the two facts off it. Absent = nothing saved. */
	settings?:
		| { showDailyVerse?: boolean | null; hiddenDashboardModules?: readonly string[] | null }
		| null;
	/** Current family master switches. Absent = every family module enabled. */
	familySwitches?: ModuleSwitchMap;
}): DashboardVisibility {
	const switches = input.familySwitches ?? {};
	const hidden = new Set((input.settings?.hiddenDashboardModules ?? []).filter(isDashboardModule));
	const showsForViewer = (id: DashboardModuleId): boolean => {
		const master =
			DASHBOARD_MODULES.find((m) => m.id === id)?.scope === 'family'
				? (switches[id] ?? true)
				: true;
		return master && !hidden.has(id);
	};
	// SAFETY: every canonical id is a key here by construction, which
	// Object.fromEntries' index signature cannot prove.
	const modules = Object.fromEntries(
		DASHBOARD_MODULES.map(({ id }) => [
			id,
			// The verse's second fact is its own settings field, not a module
			// switch, and it only ever removes visibility (080).
			showsForViewer(id) && (id !== 'verse' || input.settings?.showDailyVerse === true)
		])
	) as Record<DashboardModuleId, boolean>;
	return {
		modules,
		shows: (id: string) => showsModule(modules, id),
		needs: (read: DashboardRead) =>
			DASHBOARD_MODULES.some(({ id }) => modules[id] && DASHBOARD_READS[id].includes(read))
	};
}