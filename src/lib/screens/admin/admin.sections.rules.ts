/**
 * admin sections rules: the closed, ordered list of the admin area's two
 * destinations, and the one active-path test.
 *
 * The legacy `(admin)` layout and `/admin` index page each wrote the same two
 * href/label pairs out (plus a count key and a pair of badge colours), so the
 * nav and the cards could drift apart silently. `ADMIN_SECTIONS` is the one
 * home both render, and `isAdminSectionActive` is the layout's active rule.
 *
 * Doc: ./README.md#invariants
 */
import type { AdminCounts } from './admin.contract';

/** One admin section: a nav tab in the shell and a card on the `/admin` index. */
export type AdminSection = {
	readonly href: string;
	readonly label: string;
	/** Which badge count feeds it: one of `AdminCounts`'s keys. */
	readonly countKey: keyof AdminCounts;
	/** Badge colours while the tab is not the active one (the active tab is white on dark). */
	readonly badge: string;
};

/**
 * Bug Reports first, Unmatched Phrases second — the legacy layout's nav order
 * and the index page's card order. Red for the bug register, slate for the
 * phrase register.
 */
export const ADMIN_SECTIONS = [
	{
		href: '/admin/bugs',
		label: 'Bug Reports',
		countKey: 'openBugs',
		badge: 'bg-red-100 text-red-700'
	},
	{
		href: '/admin/nlp',
		label: 'Unmatched Phrases',
		countKey: 'openPhrases',
		badge: 'bg-slate-200 text-slate-600'
	}
] as const satisfies readonly AdminSection[];

/**
 * A tab is active on its exact path or any child path (`/admin/bugs/42`), and
 * never on a sibling that merely shares the prefix (`/admin/nlpx`).
 */
export function isAdminSectionActive(pathname: string, href: string): boolean {
	return pathname === href || pathname.startsWith(`${href}/`);
}
