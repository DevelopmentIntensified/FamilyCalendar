/**
 * The event detail page's first-paint rules: the printed day and the
 * attendance buckets.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	calendarAsDate,
	calendarAttendanceSplit,
	calendarEventDay,
	type CalendarAttendanceRow
} from './calendar.eventDay.rules';

const event = { start: '2026-02-03T10:00:00.000Z' };

describe('calendarEventDay (EventDetailList.svelte)', () => {
	it('uses `date` for the printed day when the row was split onto one', () => {
		const day = calendarEventDay({ ...event, date: '2026-02-04T00:00:00.000Z' });
		expect(day?.toISOString()).toBe('2026-02-04T00:00:00.000Z');
		expect(calendarEventDay(event)?.toISOString()).toBe('2026-02-03T10:00:00.000Z');
	});

	it.each([
		[null, null],
		[undefined, null],
		['', null],
		['not a date', null]
	])('reads %s as no date', (value, expected) => {
		expect(calendarAsDate(value)).toBe(expected);
	});
});

describe('attendance buckets (utils/attendance.ts:16-28)', () => {
	const rows: CalendarAttendanceRow[] = [
		{ userId: 'u1', status: 'going', firstName: 'Mira' },
		{ userId: 'u2', status: 'maybe' },
		{ userId: 'u3', status: 'declined' },
		{ userId: 'u4', status: 'not_going' },
		{ userId: 'u5', status: 'undecided' },
		{ userId: 'u6', status: 'something-new' }
	];

	it('keeps going / maybe / not going / undecided, unknown statuses undecided', () => {
		const split = calendarAttendanceSplit(rows);
		expect(split.going.map((row) => row.userId)).toEqual(['u1']);
		expect(split.maybe.map((row) => row.userId)).toEqual(['u2']);
		expect(split.notGoing.map((row) => row.userId)).toEqual(['u3', 'u4']);
		expect(split.undecided.map((row) => row.userId)).toEqual(['u5', 'u6']);
	});
});
