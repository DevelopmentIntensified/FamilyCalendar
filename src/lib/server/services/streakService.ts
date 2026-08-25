import { DateTime } from 'luxon';

export interface StreakInfo {
	current: number;
	best: number;
	freezeUsedInCurrentGap: boolean;
	lastCompletedWeek: string | null;
}

/**
 * ISO week key 'YYYY-Wnn' (Monday-based ISO weeks). Derived from
 * DateTime#toISOWeekDate(), which yields 'YYYY-Wnn-D' with a
 * zero-padded week number; slicing to 8 characters keeps exactly
 * 'YYYY-Wnn'. Keys are fixed-width, so plain string comparison is
 * chronological. The ISO *week-year* inside the key (not the calendar
 * year) keeps year boundaries like Jan 1 landing in the prior year's
 * final week handled correctly.
 */
export function isoWeekKey(dateIso: string): string {
	return DateTime.fromISO(dateIso).toISOWeekDate()!.slice(0, 8);
}

/** Monday of the ISO week containing the given date, as a week key. */
function weekKeyOf(dateIso: string): string {
	return DateTime.fromISO(dateIso).startOf('week').toISOWeekDate()!.slice(0, 8);
}

/** Whole weeks between two week keys (positive when b is after a). */
function gapWeeks(aKey: string, bKey: string): number {
	// 'YYYY-Wnn-1' is Monday of that ISO week.
	const a = DateTime.fromISO(`${aKey}-1`);
	const b = DateTime.fromISO(`${bKey}-1`);
	return Math.round(b.diff(a, 'weeks').weeks);
}

/**
 * Weekly completion streak over a set of completion instants (any
 * task). Schedule-aware per the mindfulness-habit design rules:
 *
 * - Weeks are ISO weeks; any completion in a week marks it done.
 * - ONE skipped week per gap is forgiven ("freeze"): it counts toward
 *   the run like a completed week, but TWO consecutive skipped weeks
 *   end the run.
 * - Grace: the current, still-open week never breaks anything — if it
 *   has no completion yet the streak stays alive as long as last week
 *   (or further back, within freeze rules) had one.
 * - Soft tone: nothing here reports failure; an empty history is just
 *   zero, not a loss.
 */
export function computeWeeklyStreak(completionDates: string[], todayIso: string): StreakInfo {
	const weeks = [...new Set(completionDates.map(isoWeekKey))].sort();
	if (weeks.length === 0) {
		return { current: 0, best: 0, freezeUsedInCurrentGap: false, lastCompletedWeek: null };
	}
	const lastCompletedWeek = weeks[weeks.length - 1];

	// Best run over all history: ascending scan. A one-week gap adds
	// both the frozen week and the completed week (+2); a larger gap
	// means two consecutive skipped weeks ended the run.
	let best = 1;
	let run = 1;
	for (let i = 1; i < weeks.length; i++) {
		const gap = gapWeeks(weeks[i - 1], weeks[i]);
		run = gap === 1 ? run + 1 : gap === 2 ? run + 2 : 1;
		best = Math.max(best, run);
	}

	// Current run: walk backwards from today's week. The open current
	// week itself counts when done and is skipped without penalty when
	// not (grace) — so the walk always starts at last week. Misses only
	// count once bridged by a later (earlier-in-time) hit, so a frozen
	// week can't inflate an otherwise dead streak.
	let current = 0;
	let freezeUsedInCurrentGap = false;
	const earliest = weeks[0];
	let misses = 0;
	if (weeks.includes(weekKeyOf(todayIso))) current = 1;
	let cursor = DateTime.fromISO(todayIso).startOf('week').minus({ weeks: 1 });
	while (true) {
		const key = cursor.toISOWeekDate()!.slice(0, 8);
		if (weeks.includes(key)) {
			current += 1 + misses;
			freezeUsedInCurrentGap ||= misses > 0;
			misses = 0;
		} else {
			misses += 1;
			if (misses >= 2) break;
		}
		if (key <= earliest) break;
		cursor = cursor.minus({ weeks: 1 });
	}

	return { current, best, freezeUsedInCurrentGap, lastCompletedWeek };
}
