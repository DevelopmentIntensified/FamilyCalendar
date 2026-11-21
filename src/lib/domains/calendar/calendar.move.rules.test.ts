/**
 * Pure event geometry, carried from `src/lib/utils/eventMove.test.ts:9-160`,
 * `src/lib/utils/eventDuplicate.ts` (the ` (copy)` payload),
 * `src/lib/utils/dayOverlap.test.ts:16-135` (#285 half-open day) and
 * `src/lib/utils/calendarMatch.test.ts:9-20`.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
	buildDuplicateEventPayload,
	buildMovePayload,
	eventDurationMinutes,
	formatRangeLabel,
	matchCalendarByName,
	minutesToDayTime,
	MOVE_SNAP_MINUTES,
	normalizeRange,
	overlapsDay,
	pickDayEntries,
	snapMinutes,
	yToMinutes
} from './calendar.move.rules';

const DAY = DateTime.fromISO('2026-09-07T00:00:00');

describe('snapMinutes (eventMove.test.ts:14-29)', () => {
	it.each([
		[0, 0],
		[7, 0],
		[8, 15],
		[60, 60],
		[1439, 1425],
		[-30, 0]
	] satisfies [number, number][])('snaps %i to %i', (input, expected) => {
		expect(snapMinutes(input)).toBe(expected);
	});

	it('honours a coarser step and clamps the end of the day', () => {
		expect(MOVE_SNAP_MINUTES).toBe(15);
		expect(snapMinutes(20, 30)).toBe(30);
		expect(snapMinutes(1440, 30)).toBe(1410);
	});
});

describe('minutesToDayTime / yToMinutes (eventMove.test.ts:31-46)', () => {
	it('maps minutes onto the given day', () => {
		const mapped = minutesToDayTime(DAY, 90);
		expect(mapped.toISODate()).toBe('2026-09-07');
		expect(mapped.hour).toBe(1);
		expect(mapped.minute).toBe(30);
	});

	it('maps pointer Y to snapped minutes on both grids', () => {
		expect(yToMinutes(120, 0, 60)).toBe(120);
		expect(yToMinutes(100, 0, 60)).toBe(105);
		expect(yToMinutes(56, 0, 56)).toBe(60);
	});
});

describe('normalizeRange (eventMove.test.ts:48-62)', () => {
	it.each([
		[240, 120, [120, 240]],
		[120, 240, [120, 240]],
		[122, 248, [120, 255]],
		[120, 120, [120, 150]],
		[120, 125, [120, 150]]
	] satisfies [number, number, [number, number]][])('normalizes %i–%i', (anchor, current, expected) => {
		expect(normalizeRange(anchor, current)).toEqual(expected);
	});
});

describe('formatRangeLabel (eventMove.test.ts:64-77)', () => {
	it.each([
		[120, 240, '2:00 AM – 4:00 AM'],
		[840, 930, '2:00 PM – 3:30 PM'],
		[720, 780, '12:00 PM – 1:00 PM'],
		[0, 60, '12:00 AM – 1:00 AM']
	] satisfies [number, number, string][])('labels %i–%i as %s', (start, end, expected) => {
		expect(formatRangeLabel(start, end)).toBe(expected);
	});
});

describe('eventDurationMinutes (eventMove.test.ts:79-90)', () => {
	it.each([
		['measures a real duration', '2026-09-07T10:00:00', '2026-09-07T11:30:00', 90],
		['floors at 15 minutes', '2026-09-07T10:00:00', '2026-09-07T10:10:00', 15],
		['defaults to 60 when the end is missing', '2026-09-07T10:00:00', null, 60],
		['defaults to 60 when the end is before the start', '2026-09-07T10:00:00', '2026-09-07T09:00:00', 60],
		['defaults to 60 when the start is unparseable', 'nope', null, 60]
	] satisfies [string, string, string | null, number][])('%s', (_name, start, end, expected) => {
		expect(eventDurationMinutes(start, end)).toBe(expected);
	});
});

describe('buildMovePayload (eventMove.test.ts:92-160)', () => {
	const oneOff = {
		id: 'e1',
		title: 'Lunch',
		start: '2026-09-07T12:00:00',
		end: '2026-09-07T13:00:00',
		description: null,
		location: null,
		recurrenceFrequency: null
	};

	it('moves a one-off as a master edit, preserving duration', () => {
		const payload = buildMovePayload(oneOff, { day: DAY, minutes: 600 });
		expect(payload.start).toContain('2026-09-07T10:00');
		expect(payload.end).toContain('2026-09-07T11:00');
		expect(payload.scope).toBeUndefined();
	});

	it('moves across days keeping wall time', () => {
		const payload = buildMovePayload(oneOff, {
			day: DateTime.fromISO('2026-09-09T00:00:00'),
			minutes: 720
		});
		expect(payload.start).toContain('2026-09-09T12:00');
	});

	it('moves a recurring event as scope:this with the start-date fallback', () => {
		const payload = buildMovePayload(
			{ ...oneOff, recurrenceFrequency: 'weekly', masterId: 'm1', occurrenceDate: undefined },
			{ day: DAY, minutes: 600 }
		);
		expect(payload.scope).toBe('this');
		expect(payload.occurrenceDate).toBe('2026-09-07');
		expect(payload.title).toBe('Lunch');
	});

	it('keeps the expanded occurrence slot when the event carries one', () => {
		const payload = buildMovePayload(
			{
				...oneOff,
				id: 'evt12345678901',
				masterId: 'evt12345678901',
				recurrenceFrequency: 'weekly',
				occurrenceDate: '2026-09-07T12:00:00.000Z'
			},
			{ day: DAY, minutes: 600 }
		);
		expect(payload.scope).toBe('this');
		expect(payload.occurrenceDate).toBe('2026-09-07T12:00:00.000Z');
		expect(payload.allDay).toBe(false);
	});
});

describe('buildDuplicateEventPayload (eventDuplicate.ts)', () => {
	it('adds the copy suffix, keeps the recurrence and carries the invitation rows', () => {
		const payload = buildDuplicateEventPayload(
			{
				title: 'Dentist',
				start: '2026-10-07T13:00:00.000Z',
				end: '2026-10-07T14:00:00.000Z',
				description: '',
				location: null,
				allDay: false,
				calendarId: 'calpersonal001',
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 2,
				recurrenceByDay: ['MO'],
				recurrenceCount: 5,
				recurrenceUntil: '2026-12-01T00:00:00.000Z',
				reminderMinutes: 30
			},
			[
				{ userId: 'user-partner', inviteType: 'required' },
				{ userId: null, inviteType: 'optional' }
			],
			['Grandma']
		);
		expect(payload).toEqual({
			title: 'Dentist (copy)',
			start: '2026-10-07T13:00:00.000Z',
			end: '2026-10-07T14:00:00.000Z',
			description: null,
			location: null,
			allDay: false,
			calendarId: 'calpersonal001',
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 2,
			recurrenceByDay: ['MO'],
			recurrenceCount: 5,
			recurrenceUntil: '2026-12-01T00:00:00.000Z',
			reminderMinutes: 30,
			attendees: [
				{ value: 'user-partner', isUser: true, inviteType: 'required' },
				{ value: 'Grandma', isUser: false, inviteType: 'optional' }
			]
		});
	});

	it('defaults a bare event to nulls and no attendees', () => {
		expect(
			buildDuplicateEventPayload(
				{ title: 'Lunch', start: '2026-10-07T13:00:00.000Z', allDay: null },
				[],
				[]
			)
		).toMatchObject({
			title: 'Lunch (copy)',
			end: null,
			description: null,
			location: null,
			allDay: false,
			calendarId: null,
			reminderMinutes: null,
			attendees: []
		});
	});
});

/** `[dayStart, nextDayStart)` for a `YYYY-MM-DD` in a zone, as the legacy helper. */
function dayBounds(iso: string, zone: string) {
	const start = DateTime.fromISO(iso, { zone }).startOf('day');
	return { start: start.toJSDate(), next: start.plus({ days: 1 }).toJSDate() };
}

describe('overlapsDay (dayOverlap.test.ts:16-67, #285)', () => {
	const zone = 'America/Chicago';
	const nov3 = dayBounds('2026-11-03', zone);

	it('keeps an event that started weeks before and ends weeks after', () => {
		expect(
			overlapsDay('2026-10-15T15:00:00.000Z', '2026-11-10T15:00:00.000Z', nov3.start, nov3.next)
		).toBe(true);
	});

	it('treats the day as half-open at its end boundary', () => {
		const end = nov3.start.toISOString();
		expect(overlapsDay('2026-11-02T20:00:00.000Z', end, nov3.start, nov3.next)).toBe(false);
		expect(
			overlapsDay('2026-11-02T20:00:00.000Z', new Date(nov3.start.getTime() + 1).toISOString(), nov3.start, nov3.next)
		).toBe(true);
		expect(overlapsDay(nov3.next.toISOString(), null, nov3.start, nov3.next)).toBe(false);
	});

	it('keeps a zero-length or end-less event at exactly 00:00 of the viewed day', () => {
		const at = nov3.start.toISOString();
		expect(overlapsDay(at, null, nov3.start, nov3.next)).toBe(true);
		expect(overlapsDay(at, at, nov3.start, nov3.next)).toBe(true);
	});

	it('uses the user zone: 03:30Z Nov 4 is still Nov 3 in Chicago', () => {
		expect(overlapsDay('2026-11-04T03:30:00.000Z', null, nov3.start, nov3.next)).toBe(true);
		const utcNov3 = dayBounds('2026-11-03', 'UTC');
		expect(overlapsDay('2026-11-04T03:30:00.000Z', null, utcNov3.start, utcNov3.next)).toBe(false);
	});
});

describe('pickDayEntries (dayOverlap.test.ts:69-135, #285)', () => {
	const window = dayBounds('2026-11-03', 'UTC');
	const entry = (id: string, date: string, end: string | null) => ({
		id,
		date: new Date(date),
		end: end === null ? null : new Date(end)
	});

	it.each([
		['a multi-day trip', entry('trip', '2026-11-03T10:00:00.000Z', '2026-11-10T09:00:00.000Z'), true],
		['an end exactly at the day 00:00', entry('ends-midnight', '2026-11-03T18:00:00.000Z', '2026-11-03T00:00:00.000Z'), false],
		['an overnight into the day', entry('overnight', '2026-11-03T00:00:00.000Z', '2026-11-03T02:00:00.000Z'), true],
		['a plain event on the day', entry('on-day', '2026-11-03T12:00:00.000Z', '2026-11-03T13:00:00.000Z'), true],
		['an event on the next day only', entry('tomorrow', '2026-11-04T00:00:00.000Z', '2026-11-04T01:00:00.000Z'), false],
		['an end-less event on the day', entry('no-end', '2026-11-03T09:00:00.000Z', null), true],
		// A span reaching into the day after its own wall time-of-day: end is
		// BEFORE the entry's date, but still after the day's 00:00.
		['a span that only reaches the day after its date', entry('late', '2026-11-03T20:00:00.000Z', '2026-11-03T08:00:00.000Z'), true]
	] satisfies [string, { id: string; date: Date; end: Date | null }, boolean][])(
		'keeps or drops %s',
		(_name, item, kept) => {
			const picked = pickDayEntries([item], window.start, window.next);
			expect(picked.map((pickedItem) => pickedItem.id)).toEqual(kept ? [item.id] : []);
		}
	);
});

describe('matchCalendarByName (calendarMatch.test.ts:9-20)', () => {
	const calendars = [
		{ id: '1', name: 'Personal' },
		{ id: '2', name: 'Family Events' }
	];

	it.each([
		['an exact name, case-insensitively', 'personal', '1'],
		['an exact multi-word name', 'FAMILY EVENTS', '2'],
		['a partial name inside the calendar name', 'family', '2'],
		['a phrase that contains the calendar name', 'my family events calendar', '2']
	] satisfies [string, string, string][])('matches %s', (_name, wanted, id) => {
		expect(matchCalendarByName(calendars, wanted)?.id).toBe(id);
	});

	it('returns null when nothing matches or the list is empty', () => {
		expect(matchCalendarByName(calendars, 'work')).toBeNull();
		expect(matchCalendarByName([], 'personal')).toBeNull();
	});
});
