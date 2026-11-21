/**
 * Pure grid rules: the month matrix, its bounded window, the week span,
 * per-day bucketing and the month cell's chip budget. Calendar facts below are
 * stated from the Gregorian calendar (a known month table), and the window
 * expectation comes from the README Invariant, never from this code.
 *
 * Doc: ./README.md#the-bounded-month-window-and-the-fetched-month-cache
 */
import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import {
	CALENDAR_MONTH_EVENT_CHIPS,
	CALENDAR_MONTH_TASK_CHIPS,
	gridWindow,
	groupCalendarRowsByDay,
	monthCellOverflow,
	monthGridCells,
	monthKey,
	normaliseCalendarWeekStart,
	weekSpan
} from './calendarPage.grid.rules';

function isoDays(dates: DateTime[]): string[] {
	return dates.map((date) => date.toISODate() ?? '');
}

describe('week start', () => {
	it('reads monday case-insensitively and treats anything else as sunday', () => {
		expect(normaliseCalendarWeekStart('monday')).toBe('monday');
		expect(normaliseCalendarWeekStart('Monday')).toBe('monday');
		expect(normaliseCalendarWeekStart('sunday')).toBe('sunday');
		expect(normaliseCalendarWeekStart('MONDAY ')).toBe('sunday');
		expect(normaliseCalendarWeekStart(null)).toBe('sunday');
		expect(normaliseCalendarWeekStart(undefined)).toBe('sunday');
	});
});

describe('weekSpan', () => {
	const anchor = DateTime.fromISO('2026-11-19'); // a Thursday

	it('draws seven days from the week start, inclusive', () => {
		expect(isoDays(weekSpan(anchor, 'sunday'))).toEqual([
			'2026-11-15',
			'2026-11-16',
			'2026-11-17',
			'2026-11-18',
			'2026-11-19',
			'2026-11-20',
			'2026-11-21'
		]);
		expect(isoDays(weekSpan(anchor, 'monday'))).toEqual([
			'2026-11-16',
			'2026-11-17',
			'2026-11-18',
			'2026-11-19',
			'2026-11-20',
			'2026-11-21',
			'2026-11-22'
		]);
	});

	it('keeps the anchor in its own week across a year boundary', () => {
		expect(isoDays(weekSpan(DateTime.fromISO('2027-01-01'), 'sunday'))[0]).toBe('2026-12-27');
		expect(isoDays(weekSpan(DateTime.fromISO('2027-01-01'), 'monday'))[0]).toBe('2026-12-28');
	});
});

describe('monthGridCells', () => {
	it('covers every cell of the month matrix and nothing else', () => {
		// November 2026 begins on a Sunday: five rows, Nov 1 through Dec 5.
		const sunday = monthGridCells(DateTime.fromISO('2026-11-19'), 'sunday');
		expect(sunday).toHaveLength(35);
		expect(isoDays(sunday)[0]).toBe('2026-11-01');
		expect(isoDays(sunday)[34]).toBe('2026-12-05');

		// Monday-first needs the six-row matrix: Oct 26 through Dec 6.
		const monday = monthGridCells(DateTime.fromISO('2026-11-19'), 'monday');
		expect(monday).toHaveLength(42);
		expect(isoDays(monday)[0]).toBe('2026-10-26');
		expect(isoDays(monday)[41]).toBe('2026-12-06');
	});

	it('asks for four weeks when the month fills exactly four rows', () => {
		// February 2026 begins on a Sunday and has 28 days: four whole weeks.
		const cells = monthGridCells(DateTime.fromISO('2026-02-10'), 'sunday');
		expect(cells).toHaveLength(28);
		expect(isoDays(cells)[0]).toBe('2026-02-01');
		expect(isoDays(cells)[27]).toBe('2026-02-28');
	});

	it('draws the leading days of the previous month and the trailing days after', () => {
		// August 2026 begins on a Saturday: six rows from Jul 26 to Sep 5.
		const cells = isoDays(monthGridCells(DateTime.fromISO('2026-08-15'), 'sunday'));
		expect(cells[0]).toBe('2026-07-26');
		expect(cells).toContain('2026-08-01');
		expect(cells).toContain('2026-08-31');
		expect(cells[cells.length - 1]).toBe('2026-09-05');
	});

	it('is anchored to the month of the date, not to the date itself', () => {
		expect(isoDays(monthGridCells(DateTime.fromISO('2026-11-01'), 'sunday'))[0]).toBe('2026-11-01');
		expect(isoDays(monthGridCells(DateTime.fromISO('2026-11-30'), 'sunday'))[0]).toBe('2026-11-01');
	});
});

describe('gridWindow', () => {
	it('asks for the matrix window and nothing else', () => {
		expect(gridWindow(DateTime.fromISO('2026-11-19'), 'sunday')).toEqual({
			from: '2026-11-01',
			to: '2026-12-05'
		});
		expect(gridWindow(DateTime.fromISO('2026-11-19'), 'monday')).toEqual({
			from: '2026-10-26',
			to: '2026-12-06'
		});
	});

	it('is narrower than legacy’s fixed ±7-day padding on a four-row month', () => {
		// Feb 2026: the matrix is Feb 1–28; legacy padded a week either side.
		expect(gridWindow(DateTime.fromISO('2026-02-10'), 'sunday')).toEqual({
			from: '2026-02-01',
			to: '2026-02-28'
		});
	});
});

describe('monthKey', () => {
	it('keys the fetched-month cache by the month on screen', () => {
		expect(monthKey(DateTime.fromISO('2026-11-19'))).toBe('2026-11');
		expect(monthKey(DateTime.fromISO('2026-11-01'))).toBe('2026-11');
		expect(monthKey(DateTime.fromISO('2027-01-01'))).toBe('2027-01');
	});
});

describe('groupCalendarRowsByDay', () => {
	it('buckets rows by their day in the viewer’s zone, skipping dateless rows', () => {
		const rows = [
			{ id: 1, at: '2026-11-19T09:00:00.000Z' },
			{ id: 2, at: '2026-11-19T23:30:00.000Z' },
			{ id: 3, at: '2026-11-20T00:30:00.000Z' },
			{ id: 4, at: null }
		];
		const grouped = groupCalendarRowsByDay(rows, (row) => row.at, 'UTC');
		expect([...grouped.keys()]).toEqual(['2026-11-19', '2026-11-20']);
		expect(grouped.get('2026-11-19')?.map((row) => row.id)).toEqual([1, 2]);
		expect(grouped.get('2026-11-20')?.map((row) => row.id)).toEqual([3]);
	});

	it('keeps a date-only row on that calendar day', () => {
		const grouped = groupCalendarRowsByDay(
			[{ id: 't1', at: '2026-11-19' }],
			(row) => row.at,
			'UTC'
		);
		expect([...grouped.keys()]).toEqual(['2026-11-19']);
	});

	it('returns an empty map for no rows', () => {
		expect(groupCalendarRowsByDay([], () => null, 'UTC').size).toBe(0);
	});
});

describe('monthCellOverflow', () => {
	it('keeps three event chips and two task chips before +N more', () => {
		expect(CALENDAR_MONTH_EVENT_CHIPS).toBe(3);
		expect(CALENDAR_MONTH_TASK_CHIPS).toBe(2);
		expect(monthCellOverflow(3, 2)).toEqual({
			events: 3,
			tasks: 2,
			overflow: 0,
			showOverflow: false
		});
	});

	it('clips a busy day and counts every row it hides', () => {
		expect(monthCellOverflow(5, 4)).toEqual({
			events: 3,
			tasks: 2,
			overflow: 4,
			showOverflow: true
		});
	});

	it('draws +N more as soon as either list overflows', () => {
		expect(monthCellOverflow(4, 0)).toEqual({
			events: 3,
			tasks: 0,
			overflow: 1,
			showOverflow: true
		});
		expect(monthCellOverflow(0, 3)).toEqual({
			events: 0,
			tasks: 2,
			overflow: 1,
			showOverflow: true
		});
	});

	it('draws nothing for an empty day', () => {
		expect(monthCellOverflow(0, 0)).toEqual({
			events: 0,
			tasks: 0,
			overflow: 0,
			showOverflow: false
		});
	});
});
