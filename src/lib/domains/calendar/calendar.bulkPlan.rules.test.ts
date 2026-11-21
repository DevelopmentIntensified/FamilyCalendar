/**
 * The deterministic smart-bulk planner, carried from
 * `src/lib/server/services/bulkAiService.test.ts:26-345` (posted-plan
 * validation, the local planner, the anchored-time rules, zoned relative dates,
 * past-date expressions and the bare day-of-month table).
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
	parseBulkPlan,
	planBulkEdits,
	resolveBulkCalendar,
	resolveBulkDate,
	resolveBulkTime,
	type BulkEventSummary
} from './calendar.bulkPlan.rules';

const IDS = ['evt-1', 'evt-2', 'evt-3'];

describe('parseBulkPlan (bulkAiService.test.ts:26-97)', () => {
	it('parses ops wrapped in {ops: []} and a bare array', () => {
		expect(
			parseBulkPlan(
				JSON.stringify({
					ops: [
						{ id: 'evt-1', title: 'Soccer practice', date: '2026-09-04' },
						{ id: 'evt-2', location: 'Community Hall' }
					]
				}),
				IDS
			)
		).toEqual([
			{ id: 'evt-1', title: 'Soccer practice', date: '2026-09-04' },
			{ id: 'evt-2', location: 'Community Hall' }
		]);
		expect(parseBulkPlan(JSON.stringify([{ id: 'evt-3', startTime: '9:30' }]), IDS)).toEqual([
			{ id: 'evt-3', startTime: '09:30' }
		]);
	});

	it('drops ids outside the allowed set (hallucination guard)', () => {
		expect(
			parseBulkPlan(
				JSON.stringify({
					ops: [
						{ id: 'evt-1', title: 'Keep' },
						{ id: 'evt-999', title: 'Drop' }
					]
				}),
				IDS
			)
		).toEqual([{ id: 'evt-1', title: 'Keep' }]);
	});

	it('rejects malformed field values and empty ops', () => {
		expect(
			parseBulkPlan(
				JSON.stringify({
					ops: [
						{ id: 'evt-1', date: 'September 4th' },
						{ id: 'evt-2', startTime: '25:99' },
						{ id: 'evt-3' }
					]
				}),
				IDS
			)
		).toEqual([]);
	});

	it('deduplicates repeated ids keeping the first valid op', () => {
		expect(
			parseBulkPlan(
				JSON.stringify({
					ops: [
						{ id: 'evt-1', title: 'First' },
						{ id: 'evt-1', title: 'Second' }
					]
				}),
				IDS
			)
		).toEqual([{ id: 'evt-1', title: 'First' }]);
	});

	it('returns [] on invalid JSON', () => {
		expect(parseBulkPlan('not json at all', IDS)).toEqual([]);
	});

	it('accepts delete ops and calendar moves', () => {
		expect(
			parseBulkPlan(
				JSON.stringify({
					ops: [
						{ id: 'evt-1', delete: true, title: 'ignored' },
						{ id: 'evt-2', calendarId: 'cal-9-abcde' }
					]
				}),
				[...IDS, 'cal-9-abcde']
			)
		).toEqual([{ id: 'evt-1', delete: true }, { id: 'evt-2', calendarId: 'cal-9-abcde' }]);
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

describe('planBulkEdits (bulkAiService.test.ts:99-227)', () => {
	it('moves every selected event to next friday, keeping time', () => {
		const ops = planBulkEdits('move to next friday', EVENTS, TODAY);
		expect(ops).toHaveLength(3);
		expect(ops[0]).toEqual({ id: 'evt-1', date: '2026-08-28' });
	});

	it('parses tomorrow and explicit dates', () => {
		expect(planBulkEdits('move to tomorrow', EVENTS, TODAY)[0].date).toBe('2026-08-24');
		expect(planBulkEdits('reschedule to 2026-09-01', EVENTS, TODAY)[0].date).toBe('2026-09-01');
		expect(planBulkEdits('move to aug 28', EVENTS, TODAY)[0].date).toBe('2026-08-28');
	});

	it('parses this weekend as the upcoming saturday', () => {
		expect(planBulkEdits('move to this weekend', EVENTS, TODAY).every((op) => op.date === '2026-08-29')).toBe(
			true
		);
	});

	it('sets a time from "at 3pm" and keeps the date', () => {
		const op = planBulkEdits('move to 3pm', EVENTS, TODAY)[0];
		expect(op?.startTime).toBe('15:00');
		expect(op?.endTime).toBe('16:00');
		expect(op?.date).toBeUndefined();
	});

	it('deletes when asked', () => {
		expect(planBulkEdits('delete these', EVENTS, TODAY)).toEqual([
			{ id: 'evt-1', delete: true },
			{ id: 'evt-2', delete: true },
			{ id: 'evt-3', delete: true }
		]);
		expect(planBulkEdits('cancel these', EVENTS, TODAY)).toEqual([
			{ id: 'evt-1', delete: true },
			{ id: 'evt-2', delete: true },
			{ id: 'evt-3', delete: true }
		]);
	});

	it('targets only named events', () => {
		expect(planBulkEdits('move soccer practice to friday', EVENTS, TODAY)).toEqual([
			{ id: 'evt-2', date: '2026-08-28' }
		]);
	});

	it('moves to a calendar by name and combines date + calendar', () => {
		const byName = planBulkEdits('move to family calendar', EVENTS, TODAY, CALS);
		expect(byName[0].calendarId).toBe('cal-fam-12345');
		expect(byName[0].date).toBeUndefined();
		expect(planBulkEdits('move to personal calendar next friday', EVENTS, TODAY, CALS)[0]).toEqual({
			id: 'evt-1',
			date: '2026-08-28',
			calendarId: 'cal-pers-67890'
		});
	});

	it('returns [] when nothing matches', () => {
		expect(planBulkEdits('make it purple', EVENTS, TODAY)).toEqual([]);
	});

	it('does not delete when an event title contains a delete verb', () => {
		const trash: BulkEventSummary[] = [
			{ id: 'evt-trash', title: 'Trash pickup reminder', start: '2026-08-26T08:00:00.000-04:00', location: null }
		];
		expect(planBulkEdits('move Trash pickup reminder to friday', trash, TODAY)).toEqual([
			{ id: 'evt-trash', date: '2026-08-28' }
		]);
	});

	it('prefers the date move when a delete verb rides along', () => {
		const ops = planBulkEdits('cancel the picnic and move to monday', EVENTS, TODAY);
		expect(ops).toHaveLength(3);
		expect(ops.every((op) => op.date === '2026-08-24' && !op.delete)).toBe(true);
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

describe('resolveBulkTime (bulkAiService.test.ts:229-250)', () => {
	it.each([
		['move to 3pm', '15:00'],
		['at 15:00', '15:00'],
		['august 15 at 6pm', '18:00'],
		['move to september 9', null],
		['move to next friday', null],
		['move to 2', null]
	] satisfies [string, string | null][])('reads %j as %j', (instruction, expected) => {
		expect(resolveBulkTime(instruction)).toBe(expected);
	});
});

describe('resolveBulkDate relative and past-date expressions (bulkAiService.test.ts:252-300)', () => {
	const SUN = DateTime.fromISO('2026-08-23T12:00:00');

	it.each([
		['yesterday', 'move to yesterday', '2026-08-22'],
		['last friday', 'move to last friday', '2026-08-21'],
		['last sunday', 'move to last sunday', '2026-08-16'],
		['last week', 'move to last week', '2026-08-16'],
		['last weekend', 'move to last weekend', '2026-08-22'],
		['a past month-day in the current year', 'move to aug 11', '2026-08-11'],
		['an explicit year', 'move to jan 5, 2028', '2028-01-05']
	] satisfies [string, string, string][])('parses %s', (_name, instruction, expected) => {
		expect(resolveBulkDate(instruction, SUN)).toBe(expected);
	});

	it('keeps a month-day within 3 months past and rolls further past to next year', () => {
		const oct1 = DateTime.fromISO('2026-10-01T12:00:00');
		expect(resolveBulkDate('move to aug 11', oct1)).toBe('2026-08-11');
		const dec15 = DateTime.fromISO('2026-12-15T12:00:00');
		expect(resolveBulkDate('move to aug 11', dec15)).toBe('2027-08-11');
		expect(resolveBulkDate('move to 11 aug', dec15)).toBe('2027-08-11');
	});

	it('reads next <month> as next year, day 1', () => {
		expect(resolveBulkDate('move to next september', SUN)).toBe('2027-09-01');
		expect(resolveBulkDate('move to next august', SUN)).toBe('2027-08-01');
	});

	it('accepts a zoned today and resolves relative dates from it', () => {
		const nyToday = DateTime.fromISO('2026-08-23T23:30', { zone: 'America/New_York' });
		const aucklandToday = DateTime.fromISO('2026-08-24T17:30', { zone: 'Pacific/Auckland' });
		expect(resolveBulkDate('move to tomorrow', nyToday)).toBe('2026-08-24');
		expect(resolveBulkDate('move to tomorrow', aucklandToday)).toBe('2026-08-25');
		expect(resolveBulkDate('move to friday', nyToday)).toBe('2026-08-28');
	});
});

describe('resolveBulkDate bare day-of-month (bulkAiService.test.ts:302-345)', () => {
	const SEP3 = DateTime.fromISO('2026-09-03T12:00:00');

	it.each([
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
	] satisfies [string, string][])('parses %j from Sep 3 as %j', (instruction, expected) => {
		expect(resolveBulkDate(instruction, SEP3)).toBe(expected);
	});

	it('rolls month-end and invalid days forward', () => {
		const aug23 = DateTime.fromISO('2026-08-23T12:00:00');
		expect(resolveBulkDate('move to the 26th', aug23)).toBe('2026-08-26');
		expect(resolveBulkDate('move to the 31st', aug23)).toBe('2026-08-31');
		const aug31 = DateTime.fromISO('2026-08-31T12:00:00');
		expect(resolveBulkDate('move to the 30th', aug31)).toBe('2026-09-30');
		const sep30 = DateTime.fromISO('2026-09-30T12:00:00');
		expect(resolveBulkDate('move to the 31st', sep30)).toBe('2026-10-31');
		const feb10 = DateTime.fromISO('2026-02-10T12:00:00');
		expect(resolveBulkDate('move to the 30th', feb10)).toBe('2026-03-30');
	});

	it('does not steal counts or times', () => {
		expect(resolveBulkDate('move 2 events to friday', SEP3)).toBe('2026-09-04');
		expect(resolveBulkDate('move to 3pm', SEP3)).toBeNull();
	});

	it('lets a delete verb overrule a bare day', () => {
		expect(resolveBulkDate('delete the 3rd item', SEP3, true)).toBeNull();
		expect(planBulkEdits('delete the 3rd one', EVENTS, TODAY)[0]).toEqual({ id: 'evt-1', delete: true });
	});

	it('plans the reported "move to the 26th" end to end', () => {
		expect(planBulkEdits('move to the 26th', EVENTS, TODAY)[0]).toEqual({ id: 'evt-1', date: '2026-08-26' });
	});
});

describe('resolveBulkCalendar (bulkAiService.test.ts:99-227)', () => {
	it.each([
		['the full name', 'move to family calendar', CALS, 'cal-fam-12345'],
		['the name without its calendar suffix', 'move to family', CALS, 'cal-fam-12345'],
		['nothing matching', 'nothing here', CALS, null]
	] satisfies [string, string, { id: string; name: string }[], string | null][])(
		'resolves %s',
		(_name, instruction, calendars, expected) => {
			expect(resolveBulkCalendar(instruction, calendars)).toBe(expected);
		}
	);
});
