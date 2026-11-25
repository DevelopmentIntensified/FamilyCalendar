/**
 * The curated public content: the marketing nav, the changelog and the roadmap.
 * Hand-written, user-facing language only — no issue numbers, no jargon.
 *
 * Dates print through `changelogDateLabel`: the legacy `MMMM d, yyyy` output in
 * UTC, from the platform's `Intl` rather than luxon (ADR 0010 — the kernel
 * formatter used to put 21.5 KB of luxon in this page's first paint), and a
 * date-only string is that calendar day in UTC, so the printed day cannot shift.
 *
 * Doc: ./README.md#invariants
 */

// --- Nav --------------------------------------------------------------------

export type MarketingNavLink = {
	readonly href: string;
	readonly label: string;
};

/** The marketing navbar: the closed four, in this order. */
export const MARKETING_NAV: readonly MarketingNavLink[] = [
	{ href: '/features', label: 'Features' },
	{ href: '/pricing', label: 'Pricing' },
	{ href: '/about', label: 'About' },
	{ href: '/contact', label: 'Contact' }
];

/**
 * The header's active link: longest prefix wins, so `/pricing/compare` still
 * highlights Pricing; a prefix only counts at a segment boundary (`/pricingfoo`
 * matches nothing), and the query half of an href is ignored for the comparison
 * (#056). The full href is returned, so the caller compares hrefs.
 */
export function marketingActiveHref(
	pathname: string,
	items: readonly MarketingNavLink[]
): string | null {
	const matches = items.filter((item) => {
		const href = item.href.split('?')[0];
		return pathname === href || pathname.startsWith(`${href}/`);
	});
	if (matches.length === 0) return null;
	return matches.reduce((winner, item) =>
		item.href.split('?')[0].length > winner.href.split('?')[0].length ? item : winner
	).href;
}

// --- Changelog --------------------------------------------------------------

export type ChangelogEntry = {
	/** ISO date (YYYY-MM-DD) the change shipped. */
	readonly date: string;
	readonly title: string;
	readonly description: string;
	/** Short category label, e.g. "Tasks", "Calendar", "Bills". */
	readonly tag?: string;
};

/** Hand-curated changelog for the public `/changelog` page, written newest first. */
export const CHANGELOG_ENTRIES: readonly ChangelogEntry[] = [
	{
		date: '2026-09-07',
		title: 'Multi-day events and attendee lists in quick-add',
		description:
			'Phrases like "camping trip Friday to Sunday with @mom and @dad" now create a single event spanning multiple days with everyone tagged.',
		tag: 'Quick Add'
	},
	{
		date: '2026-09-06',
		title: 'Add events to Google Calendar or download an .ics file',
		description:
			'Any family event can now be exported — one tap to add it to Google Calendar, or download an .ics file for any other calendar app.',
		tag: 'Calendar'
	},
	{
		date: '2026-09-06',
		title: 'Share straight into Family Planz',
		description:
			'Installed the app on your phone? Share any text — a message, an email, a note — to Family Planz and it opens a ready-to-go event with the details filled in.',
		tag: 'Mobile'
	},
	{
		date: '2026-09-06',
		title: 'See who created an event and who is going',
		description:
			'Calendar views now show a small creator badge and going indicators, so you always know who planned what and who is in.',
		tag: 'Calendar'
	},
	{
		date: '2026-09-06',
		title: 'Smarter quick-add, fewer misses',
		description:
			'Big accuracy improvements: multi-word @handles (like @aunt sally), street addresses, web links, and better wording for titles all parse correctly now.',
		tag: 'Quick Add'
	},
	{
		date: '2026-09-06',
		title: 'Task visibility: public, private, or family',
		description:
			'Choose who sees each task. Public tasks show everywhere, family tasks stay on the family page, and private tasks are yours alone.',
		tag: 'Tasks'
	},
	{
		date: '2026-09-06',
		title: 'Organize tasks with #tags',
		description:
			'Add #tags while typing a task — "#groceries milk and eggs" — and they become clickable labels you can filter by.',
		tag: 'Tasks'
	},
	{
		date: '2026-09-06',
		title: 'A fresh look for your family hub',
		description:
			'The family page got a full redesign: clear cards for members, invites, settings, and recent activity, all in one place.',
		tag: 'Family'
	},
	{
		date: '2026-09-06',
		title: 'Recurring events and tasks, more reliable',
		description:
			'Fixed a batch of edge cases around repeating items — series edits, moved occurrences, and undoing completions now behave the way you expect.',
		tag: 'Tasks'
	}
];

/**
 * The entries newest first. A new array; entries that share a date keep the
 * order they were written in (the sort is stable), so a day's list reads as
 * authored.
 */
export function changelogNewestFirst(entries: readonly ChangelogEntry[]): ChangelogEntry[] {
	return [...entries].sort((a, b) => b.date.localeCompare(a.date));
}

/** One `MMMM d, yyyy` formatter, in UTC — the legacy output, from the platform's own `Intl`. */
const LONG_DATE = new Intl.DateTimeFormat('en-US', {
	timeZone: 'UTC',
	month: 'long',
	day: 'numeric',
	year: 'numeric'
});

/**
 * The printed changelog date (`MMMM d, yyyy`, UTC): the legacy
 * `formatLongDate(date, 'UTC')` output for a `YYYY-MM-DD` entry, without luxon
 * in the client (ADR 0010). Only the date-only shape the `ChangelogEntry` type
 * documents is accepted (a date-time is not a changelog date), and a day that
 * does not exist prints `''`, the legacy formatter's answer for an unparseable
 * input. `marketing.content.rules.test.ts` pins every output against that
 * formatter.
 */
export function changelogDateLabel(date: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	if (!match) return '';
	const [year, month, day] = match.slice(1).map(Number);
	const millis = Date.UTC(year, month - 1, day);
	const printed = new Date(millis);
	if (
		printed.getUTCFullYear() !== year ||
		printed.getUTCMonth() !== month - 1 ||
		printed.getUTCDate() !== day
	) {
		return '';
	}
	return LONG_DATE.format(printed);
}

// --- Roadmap ----------------------------------------------------------------

export type RoadmapItem = {
	readonly title: string;
	readonly description: string;
};

export type RoadmapSectionId = 'shipped' | 'in-progress' | 'coming-next';

export type RoadmapSection = {
	readonly id: RoadmapSectionId;
	readonly heading: string;
	readonly blurb: string;
	readonly items: readonly RoadmapItem[];
};

/** Hand-curated roadmap for the public `/roadmap` page: no dates, no promises. */
export const ROADMAP_SECTIONS: readonly RoadmapSection[] = [
	{
		id: 'shipped',
		heading: 'Shipped',
		blurb: 'Live in the app today.',
		items: [
			{
				title: 'Quick-add for events',
				description:
					'Type a plain sentence and Family Planz turns it into an event, complete with dates, times, and people.'
			},
			{
				title: 'Task visibility',
				description: 'Every task can be public, family-only, or private — you decide who sees what.'
			},
			{
				title: 'Family hub redesign',
				description: 'Members, invites, settings, and activity in one clear, card-based page.'
			},
			{
				title: 'Grocery lists',
				description:
					'A shared list with store sections, per-person "Mine" filtering, and check-off as you shop.'
			}
		]
	},
	{
		id: 'in-progress',
		heading: 'In progress',
		blurb: 'Being built and refined right now.',
		items: [
			{
				title: 'Privacy hardening',
				description:
					"Ongoing work to keep your family's data yours — tighter access rules and clearer controls."
			}
		]
	},
	{
		id: 'coming-next',
		heading: 'Coming next',
		blurb: 'On our list, in rough priority order.',
		items: [
			{
				title: 'Calendar sync',
				description:
					'Bring your Google, Outlook, or Apple calendar events into Family Planz — research is underway.'
			}
		]
	}
];
