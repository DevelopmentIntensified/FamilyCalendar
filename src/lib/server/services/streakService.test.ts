import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { computeWeeklyStreak, isoWeekKey } from './streakService';

// Monday of ISO week 35, 2026.
const TODAY = '2026-08-24T10:00:00.000Z';
const TODAY_WEEK = '2026-W35';

/** Completion instant `weeksBack` ISO weeks before TODAY's week
 *  (Wednesday noon of that week, safely mid-week). */
function back(weeksBack: number): string {
	return DateTime.fromISO(TODAY)
		.startOf('week')
		.minus({ weeks: weeksBack })
		.set({ weekday: 3, hour: 12 })
		.toISO()!;
}

describe('isoWeekKey', () => {
	it('produces zero-padded YYYY-Wnn keys', () => {
		expect(isoWeekKey(TODAY)).toBe('2026-W35');
	});

	it('uses the ISO week-year, not the calendar year', () => {
		// Mon Dec 30 2024 belongs to week 1 of 2025.
		expect(isoWeekKey('2024-12-30T12:00:00Z')).toBe('2025-W01');
	});
});

describe('computeWeeklyStreak', () => {
	it('empty history stays soft: zero everything', () => {
		expect(computeWeeklyStreak([], TODAY)).toEqual({
			current: 0,
			best: 0,
			freezeUsedInCurrentGap: false,
			lastCompletedWeek: null
		});
	});

	it('counts plain consecutive weeks', () => {
		const info = computeWeeklyStreak([back(1), back(2), back(0)], TODAY);
		expect(info.current).toBe(3);
		expect(info.best).toBe(3);
		expect(info.freezeUsedInCurrentGap).toBe(false);
		expect(info.lastCompletedWeek).toBe(TODAY_WEEK);
	});

	it('forgives ONE skipped week per gap (freeze keeps it alive)', () => {
		// Done W32, W33; skipped W34; done again this week.
		const info = computeWeeklyStreak([back(0), back(2), back(3)], TODAY);
		expect(info.current).toBe(4); // W32..W35 span with W34 frozen
		expect(info.best).toBe(4);
		expect(info.freezeUsedInCurrentGap).toBe(true);
	});

	it('TWO consecutive skipped weeks end the streak', () => {
		// Done W32 only; W33 and W34 both skipped; done again this week.
		const info = computeWeeklyStreak([back(0), back(3)], TODAY);
		expect(info.current).toBe(1); // old run is over; this week starts fresh
		expect(info.best).toBe(1);
		expect(info.freezeUsedInCurrentGap).toBe(false);
	});

	it('current week without a completion is grace, not a break', () => {
		const info = computeWeeklyStreak([back(1), back(2)], TODAY);
		expect(info.current).toBe(2);
		expect(info.freezeUsedInCurrentGap).toBe(false);
	});

	it('grace plus freeze: missed last week still shows the streak', () => {
		// Done W33; W34 skipped; current week still open and empty.
		const info = computeWeeklyStreak([back(2)], TODAY);
		expect(info.current).toBe(2); // W33 + frozen W34
		// Best only sees recorded runs; the frozen week bridges toward
		// today, so no historical run ever contained it.
		expect(info.best).toBe(1);
		expect(info.freezeUsedInCurrentGap).toBe(true);
	});

	it('two empty weeks after history leave nothing current', () => {
		const info = computeWeeklyStreak([back(3), back(4)], TODAY);
		expect(info.current).toBe(0);
		expect(info.best).toBe(2);
		expect(info.lastCompletedWeek).toBe('2026-W32');
	});

	it('best exceeds current when an old run was longer', () => {
		// Five straight weeks long ago, then just this week.
		const dates = [back(0)];
		for (let w = 25; w <= 29; w++) dates.push(back(w));
		const info = computeWeeklyStreak(dates, TODAY);
		expect(info.current).toBe(1);
		expect(info.best).toBe(5);
		expect(info.lastCompletedWeek).toBe(TODAY_WEEK);
	});

	it('single completion last week is a live one-week streak', () => {
		const info = computeWeeklyStreak([back(1)], TODAY);
		expect(info.current).toBe(1);
		expect(info.best).toBe(1);
		expect(info.freezeUsedInCurrentGap).toBe(false);
	});

	it('single completion counts even in the open current week', () => {
		const info = computeWeeklyStreak([back(0)], TODAY);
		expect(info.current).toBe(1);
		expect(info.best).toBe(1);
	});

	it('several isolated gaps each get their own freeze', () => {
		// Done W30, skipped W31, done W32, skipped W33, done W34, done now.
		const info = computeWeeklyStreak([back(0), back(1), back(3), back(5)], TODAY);
		expect(info.current).toBe(6); // W30..W35 span with two frozen weeks
		expect(info.best).toBe(6);
		expect(info.freezeUsedInCurrentGap).toBe(true);
	});

	it('multiple completions inside one week collapse to that week', () => {
		const mondayish = DateTime.fromISO(TODAY).startOf('week').plus({ hours: 9 }).toISO()!;
		const info = computeWeeklyStreak([mondayish, back(0), back(1)], TODAY);
		expect(info.current).toBe(2);
		expect(info.best).toBe(2);
	});
});
