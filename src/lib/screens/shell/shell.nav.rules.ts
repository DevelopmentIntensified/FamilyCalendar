/**
 * shell navigation rules: the ONE signed-in destination list and the active
 * tab/href rule both navs read.
 *
 * The list is the fix for issue 065: the desktop nav and the phone tab bar
 * each carried a hand-maintained copy, and Groceries ended up reachable on a
 * laptop and nowhere on a phone. Alerts is the only permitted difference: the
 * desktop header represents it with the bell (`bellInstead`), the tab bar
 * keeps the tab. `marketingNavItems` is not here — marketing owns its public
 * header (a domain may not import a screen, R1).
 *
 * The icons are static SVG child markup from the legacy list
 * (`src/lib/utils/navItems.ts:36-69`); no user input ever reaches them.
 *
 * Doc: ./README.md#invariants
 */

/** One app destination, read by both navs. */
export type ShellNavItem = {
	readonly href: string;
	readonly label: string;
	/**
	 * Label for the phone tab bar, where six tabs share 320 px (~53 px each);
	 * an 11 px label fits about 9 characters. Falls back to `label`.
	 */
	readonly shortLabel?: string;
	/** Inline SVG child markup for the tab bar's glyph. Static literals only. */
	readonly icon?: string;
	/**
	 * The desktop header shows Alerts as a bell instead, so this item belongs
	 * to the tab bar alone. The one destination the two surfaces disagree on,
	 * and only because something else represents it on desktop.
	 */
	readonly bellInstead?: boolean;
};

/**
 * Every destination in the signed-in app, once. The desktop links are this
 * array minus `bellInstead`; the tab bar is the whole array.
 */
export const shellNavItems: readonly ShellNavItem[] = [
	{
		// Explicit-calendar escape hatch (#056): without it, dashboard-default
		// users bounce to /calendar/dashboard on every tap.
		href: '/calendar?dashboardView=1',
		label: 'Calendar',
		icon: '<rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />'
	},
	{
		href: '/calendar/dashboard',
		label: 'Dashboard',
		icon: '<rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />'
	},
	{
		href: '/calendar/tasks',
		label: 'Tasks',
		icon: '<circle cx="12" cy="12" r="9" /><path d="M9 12l2 2 4-4" />'
	},
	{
		href: '/calendar/groceries',
		label: 'Groceries',
		shortLabel: 'Shop',
		icon: '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 01-8 0" />'
	},
	{
		href: '/calendar/notifications',
		label: 'Alerts',
		icon: '<path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />',
		bellInstead: true
	},
	{
		href: '/family',
		label: 'Family',
		icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />'
	}
];

/**
 * Longest prefix wins, so `/calendar/tasks/abc` highlights Tasks, not
 * Calendar. Compare pathname only, so the query-carrying Calendar escape
 * hatch still highlights (#056); return the full href.
 *
 * `pathname` is the path every caller already has (`page.url.pathname`), never
 * a full URL. `/calendars` and `/calendarfoo` match nothing, because a prefix
 * only counts at a segment boundary.
 */
export function shellActiveHref(pathname: string): string | null {
	const matches = shellNavItems.filter((item) => {
		const base = item.href.split('?')[0];
		return pathname === base || pathname.startsWith(`${base}/`);
	});
	if (matches.length === 0) return null;
	const longest = matches.reduce((winner, item) =>
		item.href.split('?')[0].length > winner.href.split('?')[0].length ? item : winner
	);
	return longest.href;
}
