import { DateTime } from 'luxon';

/**
 * 093 rerun: the shapes the approved stats prototype draws, as pure functions.
 *
 * The page itself is a layout; every decision it makes about a number is here
 * so it can be tested without a database and without a DOM.
 *
 * Kept out of `$lib/server` deliberately: this module renders in the browser,
 * and a client component cannot import a server module. The ISO week key is
 * re-derived here rather than borrowed from `streakService`, which is server
 * only, so the two agree by definition and not by a shared import.
 */

/** One square in the seven-week streak grid. */
export interface WeekCell {
	/** 'YYYY-Wnn' - the ISO week this square stands for. */
	key: string;
	/** 'W1'..'W7' - position, oldest first, so the grid reads left to right. */
	label: string;
	/** At least one completion landed in this week. */
	hit: boolean;
	/** This is the still-open week the streak is counting. */
	isCurrent: boolean;
}

/** ISO week key 'YYYY-Wnn' (Monday-based). */
function isoWeekKey(iso: string): string {
	return DateTime.fromISO(iso).toISOWeekDate()!.slice(0, 8);
}

/**
 * The seven ISO weeks ending with the week `todayIso` falls in, oldest first.
 *
 * A completion in any week lights that week's square; several in one week are
 * still one lit square, because the streak counts weeks, not check-offs. An
 * instant that will not parse lights nothing rather than throwing - a bad row
 * in the history must not take the hero down with it.
 */
export function recentWeekCells(
	completionDates: readonly string[],
	todayIso: string
): WeekCell[] {
	const hits = new Set(
		completionDates.filter((d) => DateTime.fromISO(d).isValid).map(isoWeekKey)
	);
	const thisWeek = DateTime.fromISO(todayIso);
	const end = thisWeek.isValid ? thisWeek.startOf('week') : DateTime.now().startOf('week');
	return Array.from({ length: 7 }, (_, i) => {
		const week = end.minus({ weeks: 6 - i });
		const key = week.toISOWeekDate()!.slice(0, 8);
		return { key, label: `W${i + 1}`, hit: hits.has(key), isCurrent: i === 6 };
	});
}

/** One row of an assignment bar chart. */
export interface AssignmentBar {
	name: string;
	total: number;
	/** Width of the filled bar as a whole percent of the chart. */
	pct: number;
}

/**
 * Scale counts into bar widths against the largest one.
 *
 * Rounded to whole percent so the number is a usable CSS length, and an
 * all-zero set yields zero-width bars rather than a division by zero.
 */
export function assignmentBars(
	rows: readonly { name: string; total: number }[]
): AssignmentBar[] {
	const max = Math.max(0, ...rows.map((r) => r.total));
	return rows.map((r) => ({
		name: r.name,
		total: r.total,
		pct: max === 0 ? 0 : Math.round((r.total / max) * 100)
	}));
}

/** One person's assigned count beside their completed count. */
export interface AssignedVsDoneRow {
	name: string;
	assigned: number;
	done: number;
	/** The roster says this person is a Family Member of type child. */
	isChild: boolean;
}

/**
 * Join "tasks land on" against "tasks actually done by", per person.
 *
 * The approved page's argument card turns on the gap between these two numbers
 * for the children: a child is a row in `users`, so a task can be assigned to
 * one, but a completion is attributed to whoever actually checked it off. A
 * person who only ever completed something still gets a row - the card is
 * about a difference, and a missing row would hide it.
 *
 * `isChild` comes from the family roster's Member Type and only from there:
 * with no roster the page cannot know, and it says nobody is a child.
 */
export function assignedVsDone(input: {
	assigned: readonly { name: string; total: number }[];
	done: readonly { name: string; count: number }[];
	roster: readonly { firstName: string; memberType: string | null }[];
}): AssignedVsDoneRow[] {
	const childNames = new Set(
		input.roster.filter((m) => m.memberType === 'child').map((m) => m.firstName)
	);
	const doneBy = new Map(input.done.map((d) => [d.name, d.count]));
	const assignedBy = new Map(input.assigned.map((a) => [a.name, a.total]));
	const names = new Set([...assignedBy.keys(), ...doneBy.keys()]);
	return [...names].map((name) => ({
		name,
		assigned: assignedBy.get(name) ?? 0,
		done: doneBy.get(name) ?? 0,
		isChild: childNames.has(name)
	}));
}

/**
 * "September 2026" - the window the monthly totals are counted over.
 *
 * Null for an instant that will not parse: the page shows its own empty state
 * rather than a month name derived from rubbish.
 */
export function monthCompletionLabel(todayIso: string): string | null {
	const when = DateTime.fromISO(todayIso);
	return when.isValid ? when.toFormat('LLLL yyyy') : null;
}