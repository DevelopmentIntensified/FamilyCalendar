/**
 * Hand-curated changelog for the public /changelog page.
 * Newest first. User-facing language only — no issue numbers, no jargon.
 */
export interface ChangelogEntry {
	/** ISO date (YYYY-MM-DD) the change shipped. */
	date: string;
	title: string;
	description: string;
	/** Short category label, e.g. "Tasks", "Calendar", "Bills". */
	tag?: string;
}

export const changelog: ChangelogEntry[] = [
	{
		date: '2026-09-07',
		title: 'Scan receipts straight into your bills',
		description:
			'Snap a photo of a receipt and the details fill in your bill automatically. The scanning runs on your device — the photo itself is never stored.',
		tag: 'Bills'
	},
	{
		date: '2026-09-07',
		title: 'Quick-add now understands bills',
		description:
			'Type something like "Electric bill 84.50 due September 15" into quick-add and it becomes a bill with the amount and due date already set.',
		tag: 'Bills'
	},
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
		title: 'Bills, tidied up',
		description:
			'Mark bills paid with one toggle, spot overdue ones at a glance with an overdue pill, and delete with a quick confirm instead of a scare.',
		tag: 'Bills'
	},
	{
		date: '2026-09-06',
		title: 'Recurring events and tasks, more reliable',
		description:
			'Fixed a batch of edge cases around repeating items — series edits, moved occurrences, and undoing completions now behave the way you expect.',
		tag: 'Tasks'
	}
];
