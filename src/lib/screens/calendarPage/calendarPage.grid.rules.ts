/**
 * calendarPage grid rules: the month matrix, the one bounded window the page
 * load and the ranged fetch cover, the week span, per-day bucketing and the
 * month cell's chip overflow.
 *
 * The window is EVERY cell of the month matrix — the month plus the
 * leading/trailing days the week start needs — not legacy's fixed ±7 days,
 * which covered a month's neighbours twice over (#041). The matrix is the
 * trigger, so a five-row month asks for five weeks and a six-row month six.
 *
 * Nothing here reads the clock, the environment or the database: dates are
 * parameters and rows are grouped in the viewer's zone (R4/R5).
 *
 * Doc: ./README.md#the-bounded-month-window-and-the-fetched-month-cache
 */
import { DateTime } from 'luxon';
import { groupByDay } from '$lib/kernel/time/dates';

/** The two week starts the settings offer. */
export const CALENDAR_WEEK_STARTS = ['sunday', 'monday'] as const;

export type CalendarWeekStart = (typeof CALENDAR_WEEK_STARTS)[number];

/** The schema/settings default; an unknown stored value is not a week start. */
export const CALENDAR_WEEK_START_DEFAULT: CalendarWeekStart = 'sunday';

/** `'sunday'` | `'monday'`, case-insensitively; anything else is Sunday. */
export function normaliseCalendarWeekStart(
	value: string | null | undefined
): CalendarWeekStart {
	return (value ?? '').toLowerCase() === 'monday' ? 'monday' : CALENDAR_WEEK_START_DEFAULT;
}

/** The matrix's first cell: the week start on/before the month's first day. */
function weekStartFor(date: DateTime, weekStart: CalendarWeekStart): DateTime {
	const day = date.startOf('day');
	const sundayIndex = day.weekday % 7; // Luxon: 1=Mon..7=Sun → 0=Sun..6=Sat
	const offset = weekStart === 'monday' ? (sundayIndex + 6) % 7 : sundayIndex;
	return day.minus({ days: offset });
}

/**
 * The seven days of the week containing `anchor`, starting on `weekStart`.
 * Every day is at local midnight in `anchor`'s zone.
 */
export function weekSpan(anchor: DateTime, weekStart: CalendarWeekStart): DateTime[] {
	const start = weekStartFor(anchor, weekStart);
	return Array.from({ length: 7 }, (_, index) => start.plus({ days: index }));
}

/**
 * Every cell of the month matrix the month view draws: whole weeks from the
 * week containing the 1st through the week containing the last day. Four to
 * six rows depending on the month and the week start — never a padded six.
 */
export function monthGridCells(month: DateTime, weekStart: CalendarWeekStart): DateTime[] {
	if (!month.isValid) return [];
	const first = month.startOf('month');
	const daysInMonth = month.daysInMonth ?? 30;
	const sundayIndex = first.weekday % 7;
	const offset = weekStart === 'monday' ? (sundayIndex + 6) % 7 : sundayIndex;
	const rows = Math.ceil((offset + daysInMonth) / 7);
	const start = weekStartFor(first, weekStart);
	return Array.from({ length: rows * 7 }, (_, index) => start.plus({ days: index }));
}

/** The first and last day of the matrix, as ISO day keys. */
export interface CalendarGridWindow {
	from: string;
	to: string;
}

/**
 * The one bounded window the page load and the ranged fetch ask for: every
 * cell of the month matrix and nothing else. Callers send these two day keys
 * to the Event range read; an invalid `month` is the caller's problem (the URL
 * rule already refused it).
 */
export function gridWindow(month: DateTime, weekStart: CalendarWeekStart): CalendarGridWindow {
	const cells = monthGridCells(month, weekStart);
	const first = cells[0];
	const last = cells[cells.length - 1];
	if (!first || !last) return { from: '', to: '' };
	return { from: first.toISODate() ?? '', to: last.toISODate() ?? '' };
}

/** The month the fetched-month cache keys on: `yyyy-MM`. */
export function monthKey(date: DateTime): string {
	return date.toFormat('yyyy-MM');
}

/**
 * Buckets rows by their day in `zone`, in one pass (kernel `groupByDay`).
 * Rows without a usable instant are skipped, as the legacy bucketers did.
 */
export function groupCalendarRowsByDay<T>(
	rows: readonly T[],
	instantOf: (row: T) => Date | string | null | undefined,
	zone: string
): Map<string, T[]> {
	return groupByDay([...rows], instantOf, zone);
}

/** How many event and task chips a month cell draws before `+N more`. */
export const CALENDAR_MONTH_EVENT_CHIPS = 3;
export const CALENDAR_MONTH_TASK_CHIPS = 2;

export interface CalendarCellOverflow {
	/** Event chips actually drawn. */
	events: number;
	/** Task chips actually drawn. */
	tasks: number;
	/** Rows the `+N more` control stands for. */
	overflow: number;
	/** Whether the control is drawn at all. */
	showOverflow: boolean;
}

/**
 * The month cell's chip budget: 3 event chips + 2 task chips, then `+N more`
 * for everything left. Legacy computed this from the full day arrays
 * (`MonthDayCell.svelte:49-64`); counts are all the rule needs.
 */
export function monthCellOverflow(eventCount: number, taskCount: number): CalendarCellOverflow {
	const totalEvents = Math.max(0, eventCount);
	const totalTasks = Math.max(0, taskCount);
	const events = Math.min(totalEvents, CALENDAR_MONTH_EVENT_CHIPS);
	const tasks = Math.min(totalTasks, CALENDAR_MONTH_TASK_CHIPS);
	return {
		events,
		tasks,
		overflow: totalEvents - events + totalTasks - tasks,
		showOverflow:
			totalEvents > CALENDAR_MONTH_EVENT_CHIPS || totalTasks > CALENDAR_MONTH_TASK_CHIPS
	};
}
