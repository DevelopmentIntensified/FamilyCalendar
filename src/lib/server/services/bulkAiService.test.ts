import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import {
	parseBulkPlan,
	planBulkEdits,
	resolveBulkDate,
	resolveBulkTime,
	type BulkEventSummary
} from './bulkAiService';

const IDS = ['evt-1', 'evt-2', 'evt-3'];

describe('parseBulkPlan', () => {
	it('parses ops wrapped in {ops: []}', () => {
		const content = JSON.stringify({
			ops: [
				{ id: 'evt-1', title: 'Soccer practice', date: '2026-09-04' },
				{ id: 'evt-2', location: 'Community Hall' }
			]
		});
		const ops = parseBulkPlan(content, IDS);
		expect(ops).toHaveLength(2);
		expect(ops[0]).toEqual({ id: 'evt-1', title: 'Soccer practice', date: '2026-09-04' });
		expect(ops[1]).toEqual({ id: 'evt-2', location: 'Community Hall' });
	});

	it('accepts a bare array', () => {
		const content = JSON.stringify([{ id: 'evt-3', startTime: '9:30' }]);
		const ops = parseBulkPlan(content, IDS);
		expect(ops).toHaveLength(1);
		expect(ops[0].startTime).toBe('09:30');
	});

	it('drops ids outside the allowed set (hallucination guard)', () => {
		const content = JSON.stringify({
			ops: [
				{ id: 'evt-1', title: 'Keep' },
				{ id: 'evt-999', title: 'Drop' }
			]
		});
		const ops = parseBulkPlan(content, IDS);
		expect(ops).toHaveLength(1);
		expect(ops[0].id).toBe('evt-1');
	});

	it('rejects malformed field values and empty ops', () => {
		const content = JSON.stringify({
			ops: [
				{ id: 'evt-1', date: 'September 4th' },
				{ id: 'evt-2', startTime: '25:99' },
				{ id: 'evt-3' }
			]
		});
		expect(parseBulkPlan(content, IDS)).toHaveLength(0);
	});

	it('deduplicates repeated ids keeping the first valid op', () => {
		const content = JSON.stringify({
			ops: [
				{ id: 'evt-1', title: 'First' },
				{ id: 'evt-1', title: 'Second' }
			]
		});
		const ops = parseBulkPlan(content, IDS);
		expect(ops).toHaveLength(1);
		expect(ops[0].title).toBe('First');
	});

	it('returns [] on invalid JSON', () => {
		expect(parseBulkPlan('not json at all', IDS)).toEqual([]);
	});

	it('accepts delete ops and calendar moves', () => {
		const content = JSON.stringify({
			ops: [
				{ id: 'evt-1', delete: true, title: 'ignored' },
				{ id: 'evt-2', calendarId: 'cal-9-abcde' }
			]
		});
		const ops = parseBulkPlan(content, [...IDS, 'cal-9-abcde']);
		expect(ops[0]).toEqual({ id: 'evt-1', delete: true });
		expect(ops[1].calendarId).toBe('cal-9-abcde');
	});
});

const TODAY = '2026-08-23'; // a Sunday
const EVENTS: BulkEventSummary[] = [
	{ id: 'evt-1', title: 'Running at 5pm with george', start: '2026-08-21T17:00:00.000-04:00', location: null },
	{ id: 'evt-2', title: 'Soccer practice', start: '2026-08-25T16:00:00.000-04:00', location: null },
	{ id: 'evt-3', title: 'Back to School Hike', start: '2026-08-29T09:00:00.000-04:00', location: null }
];
const CALS = [
	{ id: 'cal-fam-12345', name: 'Family Calendar' },
	{ id: 'cal-pers-67890', name: 'Personal Calendar' }
];

describe('planBulkEdits (local parser)', () => {
	it('moves every selected event to next friday, keeping time', () => {
		const ops = planBulkEdits('move to next friday', EVENTS, TODAY);
		expect(ops).toHaveLength(3);
		expect(ops[0]).toEqual({ id: 'evt-1', date: '2026-08-28' });
	});

	it('parses tomorrow, today and explicit dates', () => {
		expect(planBulkEdits('move to tomorrow', EVENTS, TODAY)[0].date).toBe('2026-08-24');
		expect(planBulkEdits('reschedule to 2026-09-01', EVENTS, TODAY)[0].date).toBe('2026-09-01');
		expect(planBulkEdits('move to aug 28', EVENTS, TODAY)[0].date).toBe('2026-08-28');
	});

	it('parses this weekend as the upcoming saturday', () => {
		const ops = planBulkEdits('move to this weekend', EVENTS, TODAY);
		expect(ops.every((op) => op.date === '2026-08-29')).toBe(true);
	});

	it('sets a time from "at 3pm" and keeps the date', () => {
		const ops = planBulkEdits('move to 3pm', EVENTS, TODAY);
		expect(ops[0].startTime).toBe('15:00');
		expect(ops[0].date).toBeUndefined();
	});

	it('deletes when asked', () => {
		const ops = planBulkEdits('delete these', EVENTS, TODAY);
		expect(ops).toEqual([
			{ id: 'evt-1', delete: true },
			{ id: 'evt-2', delete: true },
			{ id: 'evt-3', delete: true }
		]);
	});

	it('targets only named events', () => {
		const ops = planBulkEdits('move soccer practice to friday', EVENTS, TODAY);
		expect(ops).toEqual([{ id: 'evt-2', date: '2026-08-28' }]);
	});

	it('moves to a calendar by name', () => {
		const ops = planBulkEdits('move to family calendar', EVENTS, TODAY, CALS);
		expect(ops[0].calendarId).toBe('cal-fam-12345');
		expect(ops[0].date).toBeUndefined();
	});

	it('combines date + calendar', () => {
		const ops = planBulkEdits('move to personal calendar next friday', EVENTS, TODAY, CALS);
		expect(ops[0]).toEqual({ id: 'evt-1', date: '2026-08-28', calendarId: 'cal-pers-67890' });
	});

	it('returns [] when nothing matches', () => {
		expect(planBulkEdits('make it purple', EVENTS, TODAY)).toEqual([]);
	});

	it('does not delete when an event title contains a delete verb', () => {
		const trash: BulkEventSummary[] = [
			{ id: 'evt-trash', title: 'Trash pickup reminder', start: '2026-08-26T08:00:00.000-04:00', location: null }
		];
		const ops = planBulkEdits('move Trash pickup reminder to friday', trash, TODAY);
		expect(ops).toEqual([{ id: 'evt-trash', date: '2026-08-28' }]);
		expect(ops.every((op) => !op.delete)).toBe(true);
	});

	it('prefers the date move when a delete verb rides along', () => {
		const ops = planBulkEdits('cancel the picnic and move to monday', EVENTS, TODAY);
		expect(ops).toHaveLength(3);
		expect(ops.every((op) => op.date === '2026-08-24')).toBe(true);
		expect(ops.every((op) => !op.delete)).toBe(true);
	});

	it('still deletes for pure delete instructions', () => {
		const ops = planBulkEdits('cancel these', EVENTS, TODAY);
		expect(ops).toEqual([
			{ id: 'evt-1', delete: true },
			{ id: 'evt-2', delete: true },
			{ id: 'evt-3', delete: true }
		]);
	});

	it('does not match a calendar name embedded in another word', () => {
		const ops = planBulkEdits('move to latest friday', EVENTS, TODAY, [
			{ id: 'cal-test-12345', name: 'test' }
		]);
		expect(ops[0].calendarId).toBeUndefined();
		expect(ops[0].date).toBe('2026-08-28');
	});

	it('matches multi-word calendar names by word boundary', () => {
		const ops = planBulkEdits('move to family calendar', EVENTS, TODAY, [
			...CALS,
			{ id: 'cal-test-12345', name: 'test' }
		]);
		expect(ops[0].calendarId).toBe('cal-fam-12345');
	});
});

describe('resolveBulkTime (anchored)', () => {
	it('reads "to 3pm" as 15:00', () => {
		expect(resolveBulkTime('move to 3pm')).toBe('15:00');
	});

	it('reads "at 15:00" as 15:00', () => {
		expect(resolveBulkTime('at 15:00')).toBe('15:00');
	});

	it('prefers the anchored clock time over a day-of-month', () => {
		expect(resolveBulkTime('august 15 at 6pm')).toBe('18:00');
	});

	it('does not read a bare day-of-month as a time', () => {
		expect(resolveBulkTime('move to september 9')).toBeNull();
	});

	it('ignores weekday phrases', () => {
		expect(resolveBulkTime('move to next friday')).toBeNull();
	});

	it('ignores bare small numbers', () => {
		expect(resolveBulkTime('move to 2')).toBeNull();
	});
});

describe('timezone-sensitive bulk dates', () => {
	it('accepts a zoned "today" and resolves relative dates from it', () => {
		// Sunday Aug 23 23:30 in New York is already Monday Aug 24 in Auckland.
		const nyToday = DateTime.fromISO('2026-08-23T23:30', { zone: 'America/New_York' });
		const akltoday = DateTime.fromISO('2026-08-24T17:30', { zone: 'Pacific/Auckland' });
		expect(resolveBulkDate('move to tomorrow', nyToday)).toBe('2026-08-24');
		expect(resolveBulkDate('move to tomorrow', akltoday)).toBe('2026-08-25');
	});

	it('weekday resolution crosses week boundaries from a zoned today', () => {
		const nyToday = DateTime.fromISO('2026-08-23T23:30', { zone: 'America/New_York' });
		expect(resolveBulkDate('move to friday', nyToday)).toBe('2026-08-28');
	});
});

describe('past-date expressions', () => {
	const SUN = DateTime.fromISO('2026-08-23T12:00:00'); // Sunday Aug 23

	it('parses yesterday', () => {
		expect(resolveBulkDate('move to yesterday', SUN)).toBe('2026-08-22');
	});

	it('parses last <weekday> as the most recent past occurrence', () => {
		expect(resolveBulkDate('move to last friday', SUN)).toBe('2026-08-21');
		expect(resolveBulkDate('move to last sunday', SUN)).toBe('2026-08-16');
	});

	it('parses last week and last weekend', () => {
		expect(resolveBulkDate('move to last week', SUN)).toBe('2026-08-16');
		// From a Sunday, the Saturday just gone is yesterday.
		expect(resolveBulkDate('move to last weekend', SUN)).toBe('2026-08-22');
	});

	it('keeps bare month-day in the current year even when past', () => {
		// Aug 11 is behind Aug 23 — still this year, confirm-gated client-side.
		expect(resolveBulkDate('move to aug 11', SUN)).toBe('2026-08-11');
	});

	it('keeps bare month-day in the current year when under 3 months past', () => {
		// Aug 11 from Oct 1 is ~7 weeks back — stays this year (confirm-gated).
		const oct1 = DateTime.fromISO('2026-10-01T12:00:00');
		expect(resolveBulkDate('move to aug 11', oct1)).toBe('2026-08-11');
	});

	it('rolls bare month-day to next year when more than 3 months past', () => {
		const dec15 = DateTime.fromISO('2026-12-15T12:00:00');
		expect(resolveBulkDate('move to aug 11', dec15)).toBe('2027-08-11');
		expect(resolveBulkDate('move to 11 aug', dec15)).toBe('2027-08-11');
	});

	it('next <month> always means next year', () => {
		const aug23 = DateTime.fromISO('2026-08-23T12:00:00');
		expect(resolveBulkDate('move to next september', aug23)).toBe('2027-09-01');
		expect(resolveBulkDate('move to next august', aug23)).toBe('2027-08-01');
	});

	it('honors an explicit year over the rollover rule', () => {
		expect(resolveBulkDate('move to jan 5, 2028', SUN)).toBe('2028-01-05');
	});
});

describe('bare day-of-month ("move to the 26th")', () => {
	const SEP3 = DateTime.fromISO('2026-09-03T12:00:00');
	const cases: Array<[string, string]> = [
		['move to the 26th', '2026-09-26'],
		['move to 26th', '2026-09-26'],
		['move these to the 26th', '2026-09-26'],
		['on the 15th', '2026-09-15'],
		['the 1st', '2026-10-01'],
		['move to the 2nd', '2026-10-02'],
		['move to the 3rd', '2026-09-03'],
		['move to the 21st', '2026-09-21'],
		['move to the 22nd', '2026-09-22'],
		['move to the 23rd', '2026-09-23'],
		['move to the 31st', '2026-10-31'],
		['move to the 26', '2026-09-26']
	];
	for (const [input, expected] of cases) {
		it(`parses "${input}" from Sep 3 as ${expected}`, () => {
			expect(resolveBulkDate(input, SEP3)).toBe(expected);
		});
	}

	it('stays in-month from Aug 23 and rolls month-end forward', () => {
		const aug23 = DateTime.fromISO('2026-08-23T12:00:00');
		expect(resolveBulkDate('move to the 26th', aug23)).toBe('2026-08-26');
		expect(resolveBulkDate('move to the 31st', aug23)).toBe('2026-08-31');
	});

	it('rolls to next month when the day already passed', () => {
		const aug31 = DateTime.fromISO('2026-08-31T12:00:00');
		expect(resolveBulkDate('move to the 30th', aug31)).toBe('2026-09-30');
		const sep30 = DateTime.fromISO('2026-09-30T12:00:00');
		expect(resolveBulkDate('move to the 31st', sep30)).toBe('2026-10-31');
	});

	it('skips invalid days into the next month (Feb 30th -> Mar 30th)', () => {
		const feb10 = DateTime.fromISO('2026-02-10T12:00:00');
		expect(resolveBulkDate('move to the 30th', feb10)).toBe('2026-03-30');
	});

	it('does not steal counts or times ("move 2 events to friday", "move to 3pm")', () => {
		expect(resolveBulkDate('move 2 events to friday', SEP3)).toBe('2026-09-04');
		expect(resolveBulkDate('move to 3pm', SEP3)).toBeNull();
	});

	it('lets a delete verb overrule a bare day ("delete the 3rd item" kills, not moves)', () => {
		const ops = planBulkEdits('delete the 3rd one', EVENTS, TODAY);
		expect(ops).toHaveLength(3);
		expect(ops[0]).toEqual({ id: 'evt-1', delete: true });
	});

	it('plans the reported "move to the 26th" end to end', () => {
		const ops = planBulkEdits('move to the 26th', EVENTS, TODAY);
		expect(ops).toHaveLength(3);
		expect(ops[0]).toEqual({ id: 'evt-1', date: '2026-08-26' });
	});
});
