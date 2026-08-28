/** Canonical Day Dashboard modules.
 *
 * - `family`-scoped modules can be master-switched off by family admins
 *   (dashboardModuleSwitches) — off hides them for every member.
 * - Every module can be per-user hidden from /account, regardless of scope.
 */
export const DASHBOARD_MODULES = [
	{ id: 'verse', label: 'Daily Verse', scope: 'personal' },
	{ id: 'glance', label: 'Day at a Glance', scope: 'personal' },
	{ id: 'top3', label: 'Top 3 Priorities', scope: 'personal' },
	{ id: 'board', label: 'Family Task Board', scope: 'family' },
	{ id: 'memberStrip', label: 'Family Member Strip', scope: 'family' }
] as const;

export type DashboardModuleId = (typeof DASHBOARD_MODULES)[number]['id'];

/** Modules that family admins can master-switch. */
export const FAMILY_DASHBOARD_MODULES = DASHBOARD_MODULES.filter(
	(m) => m.scope === 'family'
);

export function isDashboardModule(id: string): id is DashboardModuleId {
	return DASHBOARD_MODULES.some((m) => m.id === id);
}