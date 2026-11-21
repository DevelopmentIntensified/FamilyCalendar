/**
 * The streak rule as tables. Every case is carried over from the legacy
 * `src/lib/server/services/streakService.test.ts:30-123`, which is the
 * definition: ISO weeks, one freeze per gap, the open week in grace, empty
 * history zero.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { computeWeeklyStreak, type TaskStreak } from './tasks.stats.rules';

/** Monday of ISO week 35, 2026 (legacy `TODAY`). */
const TODAY = '2026-08-24T10:00:00.000Z';

/** Wednesday noon of the ISO week `weeksBack` before TODAY's (legacy `back`). */
function back(weeksBack: number): string {
	return DateTime.fromISO(TODAY)
		.startOf('week')
		.minus({ weeks: weeksBack })
		.set({ weekday: 3, hour: 12 })
		.toISO() as string;
}

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
		expect(info.lastCompletedWeek).toBe('2026-W35');
	});

	it('forgives ONE skipped week per gap (freeze keeps it alive)', () => {
		const info = computeWeeklyStreak([back(0), back(2), back(3)], TODAY);
		expect(info.current).toBe(4);
		expect(info.best).toBe(4);
		expect(info.freezeUsedInCurrentGap).toBe(true);
	});

	it('TWO consecutive skipped weeks end the streak', () => {
		const info = computeWeeklyStreak([back(0), back(3)], TODAY);
		expect(info.current).toBe(1);
		expect(info.best).toBe(1);
		expect(info.freezeUsedInCurrentGap).toBe(false);
	});

	it('current week without a completion is grace, not a break', () => {
		const info = computeWeeklyStreak([back(1), back(2)], TODAY);
		expect(info.current).toBe(2);
		expect(info.freezeUsedInCurrentGap).toBe(false);
	});

	it('grace plus freeze: missed last week still shows the streak', () => {
		const info = computeWeeklyStreak([back(2)], TODAY);
		expect(info.current).toBe(2);
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
		const dates = [back(0)];
		for (let weeksBack = 25; weeksBack <= 29; weeksBack += 1) dates.push(back(weeksBack));
		const info = computeWeeklyStreak(dates, TODAY);
		expect(info.current).toBe(1);
		expect(info.best).toBe(5);
		expect(info.lastCompletedWeek).toBe('2026-W35');
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
		const info = computeWeeklyStreak([back(0), back(1), back(3), back(5)], TODAY);
		expect(info.current).toBe(6);
		expect(info.best).toBe(6);
		expect(info.freezeUsedInCurrentGap).toBe(true);
	});

	it('multiple completions inside one week collapse to that week', () => {
		const mondayish = DateTime.fromISO(TODAY)
			.startOf('week')
			.plus({ hours: 9 })
			.toISO() as string;
		const info = computeWeeklyStreak([mondayish, back(0), back(1)], TODAY);
		expect(info.current).toBe(2);
		expect(info.best).toBe(2);
	});

	it('keys weeks by the ISO week-year, not the calendar year', () => {
		const info: TaskStreak = computeWeeklyStreak(['2024-12-30T12:00:00Z'], TODAY);
		expect(info.lastCompletedWeek).toBe('2025-W01');
	});

	it('ignores an unparseable instant instead of throwing', () => {
		expect(computeWeeklyStreak(['not-a-date'], TODAY).current).toBe(0);
	});
});
