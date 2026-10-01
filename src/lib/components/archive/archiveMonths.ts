import { DateTime } from 'luxon';

/**
 * The archived-events list, grouped the way the approved page groups it: one
 * card per month, the month named, the events under it.
 *
 * 094 marked the month card's padding, but the mark could only be read against
 * a list that HAS a month card - the app's list was a flat run of event cards
 * with no month grouping at all, so there was no month card to give padding to.
 * Building the grouping is therefore part of closing the mark, not extra work.
 */

/** What the archive page groups. `start` is a Date because the loader is
 *  where the raw column string is parsed — the page never has to guess. */
export interface ArchiveEventLike {
	title: string;
	start: Date;
	location?: string | null;
}

export interface ArchiveMonth<T extends ArchiveEventLike> {
	/** 'YYYY-MM' - stable, sortable, and the card's own identity. */
	key: string;
	/** 'November 2025' - what the reader is shown. */
	label: string;
	events: T[];
}

/**
 * One padding token for BOTH the month card and the event cards beneath it.
 *
 * 094: the month header card carried less padding than the cards it heads, so
 * the header read as sitting ON the frame rather than inside it. Declaring the
 * value once is what stops the two drifting apart again; `e2e/calendar/
 * ArchivePage.test.ts` measures the rendered padding to prove it landed.
 */
export const ARCHIVE_CARD_PADDING = 'p-4';

/** The month an archived event belongs to. The loader is where the raw column
 *  string is parsed, so everything downstream takes a real Date. */
export function archiveEventDate(start: Date): DateTime {
	return DateTime.fromJSDate(start);
}

/**
 * Newest month first, newest event first inside each month.
 *
 * Pure and total: an empty list is an empty list, never an empty month card,
 * and an unparseable timestamp is grouped by its own bucket rather than
 * silently dropped, so a bad row shows up instead of vanishing.
 */
export function groupEventsByMonth<T extends ArchiveEventLike>(
	events: readonly T[]
): ArchiveMonth<T>[] {
	const byKey = new Map<string, ArchiveMonth<T>>();
	for (const event of events) {
		const when = archiveEventDate(event.start);
		const key = when.isValid ? when.toFormat('yyyy-LL') : 'unknown';
		const bucket = byKey.get(key) ?? {
			key,
			label: when.isValid ? when.toFormat('LLLL yyyy') : 'Date unknown',
			events: []
		};
		bucket.events.push(event);
		byKey.set(key, bucket);
	}
	return [...byKey.values()]
		.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
		.map((month) => ({
			...month,
			events: [...month.events].sort(
				(a, b) => archiveEventDate(b.start).toMillis() - archiveEventDate(a.start).toMillis()
			)
		}));
}

/**
 * What the retention gate actually is, in the reader's terms.
 *
 * The approved page shows both windows - what you can look back, and what is
 * still kept. The app showed only the first, and when the gate was closed it
 * showed a hardcoded `30` that was never anyone's plan. Every number here is
 * read from `getUserSubscriptionLimits`; none of it is invented.
 */
export interface RetentionSummary {
	viewDays: number;
	archivedDays: number;
}

export function retentionSummary(limits: {
	retentionViewDays?: number | null;
	archivedRetentionDays?: number | null;
}): RetentionSummary {
	return {
		viewDays: limits.retentionViewDays ?? 0,
		archivedDays: limits.archivedRetentionDays ?? 0
	};
}
