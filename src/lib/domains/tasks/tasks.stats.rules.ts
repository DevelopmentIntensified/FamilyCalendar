/**
 * tasks stats rules: the ONE weekly streak definition, shared with the Day
 * Dashboard (legacy `services/streakService.ts`).
 *
 * Weeks are ISO weeks; a completion in a week marks it done; ONE skipped week
 * per gap is forgiven ("freeze") while two consecutive skipped weeks end the
 * run; the open current week is grace, not a break; an empty history is zero.
 *
 * Pure: `todayIso` and the completion instants are parameters (rule R5), and
 * nothing here reads the clock.
 *
 * K-06 owns the ISO week KEY (`isoWeekKey`) in kernel/time, but that export
 * has not landed in this branch yet, so the key helpers stay private here
 * rather than importing a name that does not exist. Move them to kernel/time
 * once the shared key lands; `computeWeeklyStreak`'s callers do not change.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';

export type TaskStreak = {
	readonly current: number;
	readonly best: number;
	readonly freezeUsedInCurrentGap: boolean;
	readonly lastCompletedWeek: string | null;
};

/**
 * `YYYY-Wnn` (ISO week-year, zero-padded week). Fixed width, so plain string
 * comparison is chronological, and the ISO week-YEAR keeps a Jan 1 that lands
 * in the previous year's final week correct. `''` for an unparseable instant.
 */
function isoWeekKey(dateIso: string): string {
	const dt = DateTime.fromISO(dateIso);
	return dt.isValid ? (dt.toISOWeekDate()?.slice(0, 8) ?? '') : '';
}

/** Monday of the ISO week containing `dateIso`, as a week key. */
function weekKeyOf(dateIso: string): string {
	const dt = DateTime.fromISO(dateIso);
	return dt.isValid ? (dt.startOf('week').toISOWeekDate()?.slice(0, 8) ?? '') : '';
}

/** Whole weeks between two week keys (positive when `b` is after `a`). */
function gapWeeks(aKey: string, bKey: string): number {
	const a = DateTime.fromISO(`${aKey}-1`);
	const b = DateTime.fromISO(`${bKey}-1`);
	return Math.round(b.diff(a, 'weeks').weeks);
}

/**
 * Weekly completion streak over a set of completion instants (any task).
 * Returns the current run, the best run over all history, whether the current
 * gap used its one freeze, and the last completed week key.
 */
export function computeWeeklyStreak(
	completionDates: readonly string[],
	todayIso: string
): TaskStreak {
	const weeks = [...new Set(completionDates.map(isoWeekKey).filter(Boolean))].sort();
	if (weeks.length === 0) {
		return { current: 0, best: 0, freezeUsedInCurrentGap: false, lastCompletedWeek: null };
	}
	const lastCompletedWeek = weeks[weeks.length - 1] ?? null;

	// Best run over all history: ascending scan. A one-week gap adds both the
	// frozen week and the completed week (+2); a larger gap means two
	// consecutive skipped weeks ended the run.
	let best = 1;
	let run = 1;
	for (let i = 1; i < weeks.length; i += 1) {
		const gap = gapWeeks(weeks[i - 1] ?? '', weeks[i] ?? '');
		run = gap === 1 ? run + 1 : gap === 2 ? run + 2 : 1;
		best = Math.max(best, run);
	}

	// Current run: walk backwards from today's week. The open current week
	// itself counts when done and is skipped without penalty when not
	// (grace), so the walk always starts at last week. Misses only count once
	// bridged by a later (earlier-in-time) hit, so a frozen week cannot
	// inflate an otherwise dead streak.
	let current = 0;
	let freezeUsedInCurrentGap = false;
	const earliest = weeks[0] ?? '';
	let misses = 0;
	if (weeks.includes(weekKeyOf(todayIso))) current = 1;
	const today = DateTime.fromISO(todayIso);
	let cursor = today.isValid ? today.startOf('week').minus({ weeks: 1 }) : null;
	while (cursor) {
		const key = cursor.toISOWeekDate()?.slice(0, 8) ?? '';
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
