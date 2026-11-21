/**
 * 105: the approved page's sections, declared once.
 *
 * The rail, the page's hash dispatch and the internal section endpoint all read
 * this one list, so a section cannot exist in the nav without a body to show,
 * or a body without a way in. Each id is also the page's own hash, which is what
 * makes a section linkable.
 *
 * `families` and `dashboard` are the approved additions, and `subscription` is
 * labelled "Plan & usage" because that is what the section shows — a limits
 * table, not a bare plan name. `notifications` sits where the approved page
 * puts it: after the families and before the calendar.
 *
 * Pure (rule R4): no reads, no "now". Doc: ./README.md#invariants
 */
export const ACCOUNT_SECTIONS = [
	{ id: 'profile', label: 'Profile' },
	{ id: 'families', label: 'Your families' },
	{ id: 'notifications', label: 'Notifications' },
	{ id: 'calendar', label: 'Calendar' },
	{ id: 'dashboard', label: 'Dashboard' },
	{ id: 'subscription', label: 'Plan & usage' },
	{ id: 'email', label: 'Email' },
	{ id: 'security', label: 'Security' },
	{ id: 'api', label: 'API Tokens' },
	{ id: 'danger', label: 'Danger Zone' }
] as const;

export type AccountSectionId = (typeof ACCOUNT_SECTIONS)[number]['id'];

/**
 * The section a hash asks for, or the first one when the hash is empty or names
 * something that no longer exists. The legacy page stripped the first `#` only
 * (`hash.replace('#', '')`), so a bare id resolves too and a second `#` does
 * not become a section.
 */
export function resolveAccountSection(hash: string): AccountSectionId {
	const wanted = hash.replace('#', '');
	if (ACCOUNT_SECTIONS.some((section) => section.id === wanted)) {
		// SAFETY: the `some` above proves `wanted` is one of the ids in the
		// list, which is exactly what AccountSectionId names.
		return wanted as AccountSectionId;
	}
	return ACCOUNT_SECTIONS[0].id;
}

/**
 * The in-page link to a section (`#calendar`) — what the rail renders, and what
 * `/calendar/settings` redirects to. One home, so a link and the hash rule can
 * never disagree about a section's spelling.
 */
export function accountSectionHref(id: AccountSectionId): string {
	return `#${id}`;
}
