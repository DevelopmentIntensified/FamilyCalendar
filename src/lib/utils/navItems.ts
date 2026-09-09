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
	{ href: '/calendar', label: 'Calendar' },
	{ href: '/calendar/dashboard', label: 'Dashboard' },
	{ href: '/calendar/tasks', label: 'Tasks' },
	{ href: '/family', label: 'Family' }
];

/** Longest prefix wins, so /calendar/tasks highlights Tasks — not Calendar. */
export function resolveActiveHref(path: string, items: NavItem[]): string | null {
	const matches = items.filter((item) => path === item.href || path.startsWith(item.href + '/'));
	if (matches.length === 0) return null;
	return matches.reduce((a, b) => (b.href.length > a.href.length ? b : a)).href;
}
