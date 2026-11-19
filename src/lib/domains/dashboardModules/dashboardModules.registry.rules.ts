/**
 * dashboardModules registry rules: the canonical module list and the
 * predicates read off it. One home for the eight ids, labels, scopes, bands
 * and meanings, so the account switches, the family hub and the dashboard can
 * never tell two stories.
 *
 * Moving a module between bands must NOT change its `id`: the id is the saved
 * state, and a user who hid a module before the move stays hidden after it.
 * Retiring an id removes it, so a saved list still naming it is inert:
 * `isDashboardModule` rejects it and `dashboardVisibility` drops it. No data
 * migration is owed to a retired id.
 *
 * Pure. No reads, no "now" (rule R5).
 *
 * Doc: ./README.md#invariants
 */
export const DASHBOARD_MODULES = [
	{
		id: 'verse',
		label: 'Daily Verse',
		scope: 'personal',
		band: 'info',
		meaning: 'Show the verse on your Day Dashboard.'
	},
	{
		id: 'glance',
		label: 'Day at a Glance',
		scope: 'personal',
		band: 'card',
		meaning: 'Show today’s events and counts.'
	},
	{
		id: 'top3',
		label: 'Top 3 Priorities',
		scope: 'personal',
		band: 'card',
		meaning: 'Show the family’s three most urgent tasks.'
	},
	{
		id: 'completed',
		label: 'Completed Today',
		scope: 'personal',
		band: 'card',
		meaning: 'Show what got finished today.'
	},
	{
		id: 'board',
		label: 'Family Task Board',
		scope: 'family',
		band: 'card',
		meaning: 'Show the family task board.'
	},
	{
		id: 'kids',
		label: "Kids' Schedule",
		scope: 'family',
		band: 'card',
		meaning: 'Show today’s kids’ events.'
	},
	{
		id: 'groceries',
		label: 'Groceries',
		scope: 'family',
		band: 'card',
		meaning: 'Show what’s still on the grocery list.'
	},
	{
		id: 'meals',
		label: 'Meals',
		scope: 'family',
		band: 'card',
		meaning: 'Show the family meal plan.'
	}
] as const;

/** One registry entry: the module's identity and the copy its switch reads. */
export type DashboardModule = (typeof DASHBOARD_MODULES)[number];

export type DashboardModuleId = DashboardModule['id'];

/** Where a module renders: a quiet info strip above the cards, or a card in
 * the toggleable band (080). */
export type DashboardBand = DashboardModule['band'];

/** A module is personal (only its own viewer can hide it) or family-scoped
 * (it also carries a family master switch). */
export type ModuleScope = DashboardModule['scope'];

/** What a page asks for: any scope, any band, or both. */
export type DashboardModuleFilter = {
	readonly scope?: ModuleScope;
	readonly band?: DashboardBand;
};

/**
 * The registry filtered for one page: the account page's info and card bands,
 * the family hub's family-wide rows. One predicate, so a page cannot filter on
 * the wrong axis or reach for a second copy of the list.
 */
export function selectDashboardModules(filter: DashboardModuleFilter = {}): DashboardModule[] {
	return DASHBOARD_MODULES.filter(
		(module) =>
			(filter.scope === undefined || module.scope === filter.scope) &&
			(filter.band === undefined || module.band === filter.band)
	);
}

/** The canonical check. The per-user save uses it to drop retired ids; a saved
 * list naming one must never resurrect it. Case-sensitive. */
export function isDashboardModule(id: string): id is DashboardModuleId {
	return DASHBOARD_MODULES.some((module) => module.id === id);
}

/** Module id → visible. Only canonical ids appear; anything unlisted is
 * defaulted to visible by {@link showsModule}. */
export type ModuleSwitchMap = Record<string, boolean>;

/**
 * The stated default for a module the map says nothing about: VISIBLE (109).
 *
 * Absent is not hidden. A module whose entry never reaches the client — a
 * loader that did not compose, an id that is not canonical — must not silently
 * blank a card the reader asked to see.
 */
export function showsModule(modules: ModuleSwitchMap | undefined | null, id: string): boolean {
	return (modules?.[id] ?? true) !== false;
}
