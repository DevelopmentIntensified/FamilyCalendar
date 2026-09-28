export interface NavItem {
	href: string;
	label: string;
	/**
	 * Short label for the mobile tab bar, where six tabs share 320px (~53px
	 * each). Falls back to `label`; an 11px label fits about 9 characters.
	 */
	shortLabel?: string;
	/**
	 * Icon child markup for glyph surfaces (the tab bar). Static literals in
	 * this file — never user input, so `{@html}` on it is safe.
	 */
	icon?: string;
	/**
	 * The desktop nav shows alerts as a bell in the header, so this item is the
	 * tab bar's job alone. The one destination the two surfaces may disagree
	 * about, and only because something else represents it on desktop.
	 */
	bellInstead?: boolean;
}

export const marketingNavItems: NavItem[] = [
	{ href: '/features', label: 'Features' },
	{ href: '/pricing', label: 'Pricing' },
	{ href: '/about', label: 'About' },
	{ href: '/contact', label: 'Contact' }
];

/**
 * Every destination in the signed-in app, once. Both navs read from this list:
 * the desktop nav drops the bell-replaced items, the tab bar drops nothing.
 * Two hand-maintained copies is how Groceries became reachable on a laptop and
 * unreachable on a phone (issue 065).
 */
const appDestinations: NavItem[] = [
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

/** The desktop nav's text links. */
export const loggedInNavItems: NavItem[] = appDestinations.filter((i) => !i.bellInstead);

/** The mobile tab bar. Every destination, because on a phone this is the nav. */
export const bottomNavItems: NavItem[] = appDestinations;

/**
 * Longest prefix wins, so /calendar/tasks highlights Tasks — not Calendar.
 * Item hrefs compare pathname-only so query-carrying hrefs (e.g. the
 * Calendar escape hatch) still highlight (#056); the full href is returned.
 */
export function resolveActiveHref(path: string, items: NavItem[]): string | null {
	const clean = (href: string) => href.split('?')[0];
	const matches = items.filter((item) => {
		const base = clean(item.href);
		return path === base || path.startsWith(base + '/');
	});
	if (matches.length === 0) return null;
	return matches.reduce((a, b) => (clean(b.href).length > clean(a.href).length ? b : a)).href;
}
