/**
 * 105: the approved page's section list, declared once.
 *
 * The sidebar renders it and the page dispatches on it, so a section cannot
 * exist in the nav without a body to show, or a body without a way in. Each id
 * is also the page's own hash, which is what makes a section linkable.
 *
 * Changed here: `families` and `dashboard` are new sections, and
 * `subscription` is labelled "Plan & usage" because that is what the section
 * shows — a limits table, not a bare plan name.
 */
export const ACCOUNT_SECTIONS = [
	{ id: 'profile', label: 'Profile' },
	{ id: 'families', label: 'Your families' },
	{ id: 'calendar', label: 'Calendar' },
	{ id: 'dashboard', label: 'Dashboard' },
	{ id: 'subscription', label: 'Plan & usage' },
	{ id: 'email', label: 'Email' },
	{ id: 'security', label: 'Security' },
	{ id: 'api', label: 'API Tokens' },
	{ id: 'danger', label: 'Danger Zone' }
] as const;

export type AccountSectionId = (typeof ACCOUNT_SECTIONS)[number]['id'];

/** The section a hash asks for, or the first one when the hash is empty or
 *  names something that no longer exists. */
export function resolveAccountSection(hash: string): AccountSectionId {
	const wanted = hash.replace('#', '');
	if (ACCOUNT_SECTIONS.some((s) => s.id === wanted)) {
		// SAFETY: the `some` above proves `wanted` is one of the ids in the
		// list, which is exactly what AccountSectionId names.
		return wanted as AccountSectionId;
	}
	return ACCOUNT_SECTIONS[0].id;
}
