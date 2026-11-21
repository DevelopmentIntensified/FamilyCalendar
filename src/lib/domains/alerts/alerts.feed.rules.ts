/**
 * alerts feed rules: one page size, the three chips and the two sections. The
 * counts are always over the whole loaded feed, never over the active filter,
 * so a chip's number does not move when it is tapped.
 *
 * Doc: ./README.md#invariants
 */
import type { AlertFilter, AlertRow } from './alerts.contract';

/**
 * One feed, one window: the bell and the Alerts page both read 50 rows, newest
 * first. The bell deep-links into the page, so truncating the destination
 * below the source is what makes "mark all read" lie about what is on screen.
 */
export const ALERT_PAGE_SIZE = 50;

/** The three filter chips, in the order the toolbar renders them. */
export const ALERT_FILTERS = ['all', 'needs_you', 'unread'] as const;

const needsYou = (row: AlertRow) => row.group === 'needs_you';
const isUnread = (row: AlertRow) => !row.readAt;

/** The rows a chip shows; `all` keeps source order. */
export function filterAlerts(rows: readonly AlertRow[], filter: AlertFilter): AlertRow[] {
	if (filter === 'all') return [...rows];
	return rows.filter(filter === 'needs_you' ? needsYou : isUnread);
}

export type AlertGroups = {
	readonly needsYou: AlertRow[];
	readonly news: AlertRow[];
};

/** Split a filtered feed into the two sections the page renders, order kept. */
export function groupAlerts(rows: readonly AlertRow[]): AlertGroups {
	return {
		needsYou: rows.filter(needsYou),
		news: rows.filter((row) => row.group === 'news')
	};
}

export type AlertCounts = {
	readonly all: number;
	readonly needsYou: number;
	readonly unread: number;
};

/** The chip counts, over the whole loaded feed. */
export function alertCounts(rows: readonly AlertRow[]): AlertCounts {
	return {
		all: rows.length,
		needsYou: rows.filter(needsYou).length,
		unread: rows.filter(isUnread).length
	};
}

/**
 * The click fields a row cares about. A modified click (new tab, new window,
 * middle button) belongs to the browser: opening a tab must not race a
 * read-mark, and the row is a real `<a href>` either way.
 */
export type AlertClickEvent = {
	readonly defaultPrevented: boolean;
	readonly button: number;
	readonly metaKey: boolean;
	readonly ctrlKey: boolean;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
};

/** True only for an unmodified left click the page has not already handled. */
export function isPlainAlertClick(event: AlertClickEvent): boolean {
	return (
		!event.defaultPrevented &&
		event.button === 0 &&
		!event.metaKey &&
		!event.ctrlKey &&
		!event.shiftKey &&
		!event.altKey
	);
}
