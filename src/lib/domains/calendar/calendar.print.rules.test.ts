/**
 * The printable month's layout, carried from
 * `src/lib/server/services/printData.ts:34-167` and the print golden
 * (`calendar.bulk.http.db.test.ts › lays the requested month out as a
 * Sunday-first grid by default`, `› writes each item with its colour,
 * all-day flag and 9a / 2:30p time`).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	calendarPrintGrid,
	MONTH_NAMES,
	monthNeighbours,
	shortTime,
	type PrintSourceItem
} from './calendar.print.rules';

const items: PrintSourceItem[] = [
	{ title: 'Dentist', color: '#123456', allDay: false, start: '2026-02-01T09:00:00.000Z', date: '2026-02-01T00:00:00.000Z' },
	{ title: 'Piano', color: '#123456', allDay: false, start: '2026-02-03T14:30:00.000Z', date: '2026-02-03T00:00:00.000Z' },
	{ title: 'Camping', color: '#00ff00', allDay: true, start: '2026-02-05T00:00:00.000Z', date: '2026-02-05T00:00:00.000Z' }
];

describe('calendarPrintGrid (printData.ts:99-167)', () => {
	it('lays a Sunday-first February out as 28 cells', () => {
		const grid = calendarPrintGrid({
			year: 2026,
			month: 2,
			weekStart: 'sunday',
			todayIso: '2026-02-10',
			items,
			zone: 'utc'
		});
		expect(grid).toHaveLength(28);
		expect(grid[0]).toMatchObject({ day: 1, iso: '2026-02-01', inMonth: true, isToday: false });
		expect(grid[27]).toMatchObject({ day: 28, iso: '2026-02-28', inMonth: true, isToday: false });
		expect(grid[9]).toMatchObject({ day: 10, isToday: true });
	});

	it('pads a Monday-first February to 35 cells with the neighbouring months', () => {
		const grid = calendarPrintGrid({
			year: 2026,
			month: 2,
			weekStart: 'monday',
			todayIso: '2026-02-10',
			items: [],
			zone: 'utc'
		});
		expect(grid).toHaveLength(35);
		expect(grid[0]).toMatchObject({ day: 26, iso: '2026-01-26', inMonth: false });
		expect(grid[6]).toMatchObject({ day: 1, iso: '2026-02-01', inMonth: true });
		expect(grid[34]).toMatchObject({ day: 1, iso: '2026-03-01', inMonth: false });
	});

	it('writes each item with its colour, all-day flag and 9a / 2:30p time', () => {
		const grid = calendarPrintGrid({
			year: 2026,
			month: 2,
			weekStart: 'sunday',
			todayIso: '2026-02-10',
			items,
			zone: 'utc'
		});
		expect(grid[0]?.items).toEqual([{ title: 'Dentist', color: '#123456', allDay: false, time: '9a' }]);
		expect(grid[2]?.items).toEqual([{ title: 'Piano', color: '#123456', allDay: false, time: '2:30p' }]);
		expect(grid[4]?.items).toEqual([{ title: 'Camping', color: '#00ff00', allDay: true, time: null }]);
		expect(grid[1]?.items).toEqual([]);
	});

	it('places a neighbouring month’s item on its own padded cell and blanks an invalid start', () => {
		const grid = calendarPrintGrid({
			year: 2026,
			month: 2,
			weekStart: 'monday',
			todayIso: '2026-02-10',
			items: [
				{ title: 'January', color: '#111111', allDay: false, start: '2026-01-31T09:00:00.000Z', date: '2026-01-31T00:00:00.000Z' },
				{ title: 'Broken', color: '#111111', allDay: false, start: 'garbage', date: '2026-02-02T00:00:00.000Z' }
			],
			zone: 'utc'
		});
		expect(grid[5]?.items).toEqual([{ title: 'January', color: '#111111', allDay: false, time: '9a' }]);
		expect(grid[6]?.items).toEqual([]);
		expect(grid[7]?.items).toEqual([{ title: 'Broken', color: '#111111', allDay: false, time: null }]);
	});
});

describe('monthNeighbours (printData.ts:152-155)', () => {
	it.each([
		[2026, 1, { year: 2025, month: 12 }, { year: 2026, month: 2 }],
		[2026, 6, { year: 2026, month: 5 }, { year: 2026, month: 7 }],
		[2026, 12, { year: 2026, month: 11 }, { year: 2027, month: 1 }]
	] satisfies [number, number, { year: number; month: number }, { year: number; month: number }][])(
		'rolls %i-%i across the year',
		(year, month, prev, next) => {
			expect(monthNeighbours(year, month)).toEqual({ prev, next });
		}
	);
});

describe('shortTime (printData.ts:108-115)', () => {
	it.each([
		['2026-02-01T09:00:00.000Z', '9a'],
		['2026-02-03T14:30:00.000Z', '2:30p'],
		['2026-02-03T12:00:00.000Z', '12p'],
		['2026-02-03T00:00:00.000Z', '12a'],
		['garbage', '']
	] satisfies [string, string][])('writes %j as %j', (instant, expected) => {
		expect(shortTime(instant, 'utc')).toBe(expected);
	});

	it('accepts a Date and reads the viewer zone', () => {
		expect(shortTime(new Date('2026-02-01T09:00:00.000Z'), 'utc')).toBe('9a');
		expect(shortTime('2026-02-01T09:00:00.000Z', 'America/Chicago')).toBe('3a');
	});

	it('names the twelve months in calendar order', () => {
		expect(MONTH_NAMES).toHaveLength(12);
		expect(MONTH_NAMES[0]).toBe('January');
		expect(MONTH_NAMES[1]).toBe('February');
		expect(MONTH_NAMES[11]).toBe('December');
	});
});
