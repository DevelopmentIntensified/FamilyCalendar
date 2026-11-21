/**
 * tasks archive rules — the `/calendar/archive` page's pure decisions: how the
 * archived Events group into month cards, and how the plan's two retention
 * windows read as one scale. Legacy home: `components/archive/archiveMonths.ts`
 * (the page's own model; it travelled with the archive screen, so it lands
 * here with the route).
 *
 * Pure: the rows come in already parsed (`start` is a real Date — the loader is
 * where the column string is parsed) and nothing reads the clock.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';

/** What the archive page groups: a title and a parsed start; `location` rides along for the row. */
export type TaskArchiveEventLike = {
	readonly title: string;
	readonly start: Date;
	readonly location?: string | null;
};

/** One month card of the archive. */
export type TaskArchiveMonth<T extends TaskArchiveEventLike> = {
	/** 'YYYY-MM' — stable, sortable, and the card's own identity. */
	readonly key: string;
	/** 'November 2025' — what the reader is shown. */
	readonly label: string;
	readonly events: T[];
};

/**
 * One padding token for BOTH the month card and the event rows inside it.
 *
 * 094: the month header card carried less padding than the cards it heads, so
 * the header read as sitting ON the frame rather than inside it. Declaring the
 * value once is what stops the two drifting apart again;
 * `e2e/calendar/ArchivePage.test.ts` measures the rendered padding to prove it
 * landed.
 */
export const ARCHIVE_CARD_PADDING = 'p-4';

/** The month an archived Event belongs to; the loader already parsed the start. */
export function taskArchiveDate(start: Date): DateTime {
	return DateTime.fromJSDate(start);
}

/** "6 Dec 2025" — one archive row's date column. */
export function taskArchiveDayLabel(start: Date): string {
	return taskArchiveDate(start).toFormat('d LLL yyyy');
}

/**
 * Newest month first, newest Event first inside each month.
 *
 * Pure and total: an empty list is an empty list, never an empty month card,
 * and an unparseable timestamp is grouped by its own bucket rather than
 * silently dropped, so a bad row shows up instead of vanishing.
 */
export function taskArchiveMonths<T extends TaskArchiveEventLike>(
	events: readonly T[]
): TaskArchiveMonth<T>[] {
	const byKey = new Map<string, TaskArchiveMonth<T>>();
	for (const event of events) {
		const when = taskArchiveDate(event.start);
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
				(a, b) => taskArchiveDate(b.start).toMillis() - taskArchiveDate(a.start).toMillis()
			)
		}));
}

/** What the retention gate is in the reader's terms: what you can see, and what is still kept. */
export type TaskRetentionSummary = {
	readonly viewDays: number;
	readonly archivedDays: number;
};

/**
 * The approved page shows both windows — what you can look back, and what is
 * still kept. Every number is read from the plan's limits; none of it is
 * invented (the gate once printed a hardcoded `30` no plan produced, 125).
 */
export function taskRetentionSummary(limits: {
	readonly retentionViewDays?: number | null;
	readonly archivedRetentionDays?: number | null;
}): TaskRetentionSummary {
	return {
		viewDays: limits.retentionViewDays ?? 0,
		archivedDays: limits.archivedRetentionDays ?? 0
	};
}

/** The retention windows as the three bands of a track. */
export type TaskRetentionScale = {
	/** Days from today to the far end of the track. */
	readonly total: number;
	/** Days you can open right now. */
	readonly viewable: number;
	/** Days kept but out of reach. Never negative. */
	readonly kept: number;
	/** The day the whole thing goes. */
	readonly deletedAfter: number;
	/** `viewable` as a whole percent of `total`. */
	readonly viewablePct: number;
};

/**
 * The retention windows as the three bands of a track (094 rerun): viewable
 * now, kept but not viewable, deleted. Every number is still the plan's; only
 * the shape is new.
 *
 * `total` is the far end of the track, so the two windows are read as one span
 * rather than as two unrelated limits. That far end is the retention window —
 * when the data is actually gone — and the viewable band is clamped to it, so
 * contradictory config (a plan showing more than it keeps) fills the track
 * exactly once instead of overflowing it. A plan with no windows at all
 * divides by nothing and fills nothing.
 */
export function taskRetentionScale(summary: TaskRetentionSummary): TaskRetentionScale {
	// `archivedDays` is the far end: it is when the data is actually gone. Every
	// real tier keeps at least as long as it shows (free 30/90, family 365/730),
	// so this is normally the larger number — and taking the maximum would
	// silently draw a track whose last band says "deleted" at a date the plan
	// has not reached yet.
	const total = Math.max(summary.archivedDays, 0);
	const viewable = Math.min(summary.viewDays, total);
	const kept = Math.max(total - viewable, 0);
	return {
		total,
		viewable,
		kept,
		deletedAfter: total,
		viewablePct: total === 0 ? 0 : Math.round((viewable / total) * 100)
	};
}
