export interface NavItem {
	href: string;
	label: string;
}

export const marketingNavItems: NavItem[] = [
	{ href: '/features', label: 'Features' },
	{ href: '/pricing', label: 'Pricing' },
	{ href: '/about', label: 'About' },
	{ href: '/contact', label: 'Contact' }
];

export const loggedInNavItems: NavItem[] = [
	// ?dashboardView=1 is the explicit-calendar escape hatch (#056): without
	// it, dashboard-default users get bounced to /calendar/dashboard on every
	// tap, so the Calendar button appears dead.
	{ href: '/calendar?dashboardView=1', label: 'Calendar' },
	{ href: '/calendar/dashboard', label: 'Dashboard' },
	{ href: '/calendar/tasks', label: 'Tasks' },
	{ href: '/calendar/groceries', label: 'Groceries' },
	{ href: '/family', label: 'Family' }
];

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
