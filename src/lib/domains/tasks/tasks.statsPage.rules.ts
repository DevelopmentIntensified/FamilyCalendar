/**
 * tasks stats page rules — the shapes the `/calendar/stats` page draws, as
 * pure functions: the streak hero's seven ISO-week squares, the two assignment
 * bar charts, the assigned-vs-done pairing (the approved prototype's argument
 * card) and the month label. Legacy home: the route-local `statsPageModel.ts`.
 *
 * Pure: `todayIso` and the instants are parameters (rule R5); only the bad
 * instant fallbacks in `taskWeekCells` read the clock, exactly as legacy did.
 *
 * The ISO week key is re-derived here rather than imported from
 * `tasks.stats.rules.ts`, whose copy is private: K-06 owns the shared key in
 * kernel/time, and both copies move there together.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import { systemClock } from '$lib/kernel/time/clock';

/** One square in the seven-week streak grid. */
export type TaskWeekCell = {
	/** 'YYYY-Wnn' — the ISO week this square stands for. */
	readonly key: string;
	/** 'W1'..'W7' — position, oldest first, so the grid reads left to right. */
	readonly label: string;
	/** At least one completion landed in this week. */
	readonly hit: boolean;
	/** This is the still-open week the streak is counting. */
	readonly isCurrent: boolean;
};

/** ISO week key 'YYYY-Wnn' (Monday-based). */
function isoWeekKey(iso: string): string {
	return DateTime.fromISO(iso).toISOWeekDate()?.slice(0, 8) ?? '';
}

/**
 * The seven ISO weeks ending with the week `todayIso` falls in, oldest first.
 *
 * A completion in any week lights that week's square; several in one week are
 * still one lit square, because the streak counts weeks, not check-offs. An
 * instant that will not parse lights nothing rather than throwing — a bad row
 * in the history must not take the hero down with it.
 */
export function taskWeekCells(
	completionDates: readonly string[],
	todayIso: string,
	now: Date = systemClock.now()
): TaskWeekCell[] {
	const hits = new Set(
		completionDates.filter((date) => DateTime.fromISO(date).isValid).map(isoWeekKey)
	);
	const thisWeek = DateTime.fromISO(todayIso);
	const end = thisWeek.isValid
		? thisWeek.startOf('week')
		: DateTime.fromJSDate(now).startOf('week');
	return Array.from({ length: 7 }, (_, i) => {
		const week = end.minus({ weeks: 6 - i });
		const key = week.toISOWeekDate()?.slice(0, 8) ?? '';
		return { key, label: `W${i + 1}`, hit: hits.has(key), isCurrent: i === 6 };
	});
}

/** One row of an assignment bar chart. */
export type TaskAssignmentBar = {
	readonly name: string;
	readonly total: number;
	/** Width of the filled bar as a whole percent of the chart. */
	readonly pct: number;
};

/**
 * Scale counts into bar widths against the largest one.
 *
 * Rounded to whole percent so the number is a usable CSS length, and an
 * all-zero set yields zero-width bars rather than a division by zero.
 */
export function taskAssignmentBars(
	rows: readonly { readonly name: string; readonly total: number }[]
): TaskAssignmentBar[] {
	const max = Math.max(0, ...rows.map((row) => row.total));
	return rows.map((row) => ({
		name: row.name,
		total: row.total,
		pct: max === 0 ? 0 : Math.round((row.total / max) * 100)
	}));
}

/** One person's assigned count beside their completed count. */
export type TaskAssignedVsDoneRow = {
	readonly name: string;
	readonly assigned: number;
	readonly done: number;
	/** The roster says this person is a Family Member of type child. */
	readonly isChild: boolean;
};

/**
 * Join "tasks land on" against "tasks actually done by", per person.
 *
 * The approved page's argument card turns on the gap between these two numbers
 * for the children: a child is a row in `users`, so a task can be assigned to
 * one, but a completion is attributed to whoever actually checked it off. A
 * person who only ever completed something still gets a row — the card is
 * about a difference, and a missing row would hide it.
 *
 * `isChild` comes from the family roster's Member Type and only from there:
 * with no roster the page cannot know, and it says nobody is a child.
 */
export function taskAssignedVsDone(input: {
	readonly assigned: readonly { readonly name: string; readonly total: number }[];
	readonly done: readonly { readonly name: string; readonly count: number }[];
	readonly roster: readonly { readonly firstName: string; readonly memberType: string | null }[];
}): TaskAssignedVsDoneRow[] {
	const childNames = new Set(
		input.roster.filter((member) => member.memberType === 'child').map((member) => member.firstName)
	);
	const doneBy = new Map(input.done.map((row) => [row.name, row.count]));
	const assignedBy = new Map(input.assigned.map((row) => [row.name, row.total]));
	const names = new Set([...assignedBy.keys(), ...doneBy.keys()]);
	return [...names].map((name) => ({
		name,
		assigned: assignedBy.get(name) ?? 0,
		done: doneBy.get(name) ?? 0,
		isChild: childNames.has(name)
	}));
}

/**
 * "September 2026" — the window the monthly totals are counted over. Null for an
 * instant that will not parse: the page shows its own empty state rather than a
 * month name derived from rubbish.
 */
export function taskMonthLabel(todayIso: string): string | null {
	const when = DateTime.fromISO(todayIso);
	return when.isValid ? when.toFormat('LLLL yyyy') : null;
}

/** "Sep 29" — the recently-completed list's stamp; `''` when it has none or it is unparseable. */
export function taskCompletedDayLabel(completedAt: string | null | undefined): string {
	if (!completedAt) return '';
	const when = DateTime.fromISO(completedAt);
	return when.isValid ? when.toFormat('MMM d') : '';
}
