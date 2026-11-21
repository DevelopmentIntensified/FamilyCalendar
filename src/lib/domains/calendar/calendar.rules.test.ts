/**
 * Range, access, invites, drag/duplicate geometry, the chip vocabulary, the
 * print grid and the bulk planner. Expected values are the legacy pure tests'
 * own (`eventRange.test.ts`, `eventIds`-adjacent access tests,
 * `eventInvites.test.ts`, `eventMove.test.ts`, `chipVocabulary.test.ts`,
 * `dayOverlap.test.ts`, `bulkAiService.test.ts`) and the print golden.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
	eventRangeWindow,
	MAX_RANGE_DAYS,
	RANGE_REQUIRED_MESSAGE,
	RANGE_TOO_WIDE_MESSAGE,
	resolveEventRange
} from './calendar.range.rules';
import {
	canMutateEventRow,
	eventTouchDecision,
	isEventVisibleTo,
	masterIdsIn
} from './calendar.scope.rules';
import { isKnownInvitee, normalizeInvites, resolveInvites } from './calendar.invites.rules';
import {
	buildDuplicateEventPayload,
	buildMovePayload,
	eventDurationMinutes,
	formatRangeLabel,
	matchCalendarByName,
	minutesToDayTime,
	normalizeRange,
	overlapsDay,
	pickDayEntries,
	snapMinutes,
	yToMinutes
} from './calendar.move.rules';
import {
	buildSharedTargetText,
	chipKind,
	describeEventChip,
	SPONSORED_A11Y,
	splitEventsByDay
} from './calendar.chips.rules';
import { calendarPrintGrid, monthNeighbours, shortTime } from './calendar.print.rules';
import {
	parseBulkPlan,
	planBulkEdits,
	resolveBulkCalendar,
	resolveBulkDate,
	resolveBulkTime,
	type BulkEventSummary
} from './calendar.bulkPlan.rules';

const range = (query: string) => resolveEventRange(new URLSearchParams(query));

describe('resolveEventRange', () => {
	it('reads a from/to pair as the window it was asked for', () => {
		expect(range('from=2026-10-01&to=2026-10-31')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
		expect(range('from=2026-10-01&to=2026-10-01')).toMatchObject({ from: '2026-10-01' });
	});

	it.each([
		['only one end', 'from=2026-10-01'],
		['an unparseable date', 'from=october&to=2026-10-31'],
		['a date that does not exist', 'from=2026-02-31&to=2026-03-05'],
		['a backwards range', 'from=2026-10-31&to=2026-10-01']
	])('refuses %s', (_name, query) => {
		expect(range(query)).toEqual({ error: RANGE_REQUIRED_MESSAGE });
	});

	it('caps the span so one request cannot become the ±2 years it replaced', () => {
		expect(range('from=2026-01-01&to=2026-12-31')).toEqual({ error: RANGE_TOO_WIDE_MESSAGE });
		expect(MAX_RANGE_DAYS).toBe(62);
	});
});

describe('eventRangeWindow', () => {
	it('covers the whole requested range with one grid week of padding each side', () => {
		const window = eventRangeWindow({ from: '2026-11-01', to: '2026-12-31' });
		expect(window.startIso).toBe('2026-10-25T00:00:00.000Z');
		expect(window.endIso).toBe('2027-01-07T23:59:59.999Z');
	});

	it('handles a single day and a year end', () => {
		const single = eventRangeWindow({ from: '2026-10-15', to: '2026-10-15' });
		expect(single.startIso).toBe('2026-10-08T00:00:00.000Z');
		expect(single.endIso).toBe('2026-10-22T23:59:59.999Z');

		const yearEnd = eventRangeWindow({ from: '2026-12-15', to: '2027-01-20' });
		expect(yearEnd.startIso).toBe('2026-12-08T00:00:00.000Z');
		expect(yearEnd.endIso).toBe('2027-01-27T23:59:59.999Z');
	});
});

describe('access predicates', () => {
	const row = { ownerId: 'user-owner', calendarId: 'cal-family' };

	it('reads include the owner and any readable calendar', () => {
		expect(isEventVisibleTo(row, 'user-owner', [])).toBe(true);
		expect(isEventVisibleTo(row, 'user-reader', ['cal-family'])).toBe(true);
		expect(isEventVisibleTo(row, 'user-reader', ['cal-other'])).toBe(false);
		expect(isEventVisibleTo({ ownerId: 'x', calendarId: null }, 'x', [])).toBe(true);
	});

	it('the write leg needs the event or the calendar OWNER (#165)', () => {
		expect(canMutateEventRow(row, 'user-owner', [])).toBe(true);
		expect(canMutateEventRow(row, 'user-reader', ['cal-family'])).toBe(false);
		expect(canMutateEventRow(row, 'user-calendar-owner', ['cal-family'])).toBe(true);
		expect(canMutateEventRow({ ownerId: 'x', calendarId: null }, 'x', [])).toBe(true);
		expect(canMutateEventRow({ ownerId: 'x', calendarId: null }, 'y', [])).toBe(false);
	});

	it('eventTouchDecision tells not-found from forbidden', () => {
		expect(eventTouchDecision(null, 'u', [])).toBe('not-found');
		expect(eventTouchDecision(row, 'stranger', [])).toBe('forbidden');
		expect(eventTouchDecision(row, 'reader', ['cal-family'])).toBe('allowed');
	});
});

describe('masterIdsIn', () => {
	it('resolves composites, drops junk and keeps first-seen order', () => {
		expect(
			masterIdsIn([
				{ id: 'evtoneoff01~2026-10-05T09:00:00.000Z' },
				{ id: 'evtoneoff01' },
				{ id: '' },
				{ id: 'x' },
				{ id: 'evtoneoff02' }
			])
		).toEqual(['evtoneoff01', 'evtoneoff02']);
	});
});

describe('invites', () => {
	const context = { userId: 'user-me', rosterUserIds: ['user-me', 'user-partner'] };

	it.each([
		['trims guest names and drops blanks', ['  Grandma  ', '   '], [{ name: 'Grandma', inviteType: 'optional' }]],
		[
			'keeps structured members and their invite type',
			[{ value: 'user-partner', isUser: true, inviteType: 'required' }],
			[{ userId: 'user-partner', inviteType: 'required' }]
		],
		[
			'drops an unrecognized user id instead of storing it as a guest',
			[{ value: 'nobody-known', isUser: true }],
			[]
		],
		[
			'promotes a known member id sent as a guest name (#274)',
			['user-partner'],
			[{ userId: 'user-partner', inviteType: 'optional' }]
		],
		[
			'a guest is always optional even when it asks for required',
			[{ value: 'Grandma', isUser: false, inviteType: 'required' }],
			[{ name: 'Grandma', inviteType: 'optional' }]
		],
		['a non-array payload means no invites', 'Grandma', []]
	])('%s', (_name, raw, expected) => {
		expect(resolveInvites(raw, context)).toEqual(expected);
	});

	it('without a roster only the caller themself is a known member', () => {
		expect(isKnownInvitee('user-me', 'user-me', null)).toBe(true);
		expect(isKnownInvitee('user-partner', 'user-me', null)).toBe(false);
		expect(resolveInvites(['user-partner'], { userId: 'user-me', rosterUserIds: null })).toEqual([
			{ name: 'user-partner', inviteType: 'optional' }
		]);
	});

	it('normalizeInvites keeps the legacy string/object split', () => {
		expect(normalizeInvites([' Grand ', { userId: 'u1', inviteType: 'required' }])).toEqual([
			{ name: 'Grand', inviteType: 'optional' },
			{ userId: 'u1', inviteType: 'required' }
		]);
	});
});

describe('drag geometry', () => {
	it.each([
		[0, 0],
		[7, 0],
		[8, 15],
		[60, 60],
		[1439, 1425],
		[-30, 0]
	])('snaps %i to %i', (input, expected) => {
		expect(snapMinutes(input)).toBe(expected);
	});

	it('maps minutes and pointer Y onto the day', () => {
		const day = DateTime.fromISO('2026-09-07T00:00:00');
		const mapped = minutesToDayTime(day, 90);
		expect(mapped.toISODate()).toBe('2026-09-07');
		expect(mapped.hour).toBe(1);
		expect(mapped.minute).toBe(30);
		expect(yToMinutes(120, 0, 60)).toBe(120);
		expect(yToMinutes(100, 0, 60)).toBe(105);
		expect(yToMinutes(56, 0, 56)).toBe(60);
	});

	it('orders and snaps a drag range, expanding degenerate drags', () => {
		expect(normalizeRange(240, 120)).toEqual([120, 240]);
		expect(normalizeRange(122, 248)).toEqual([120, 255]);
		expect(normalizeRange(120, 120)).toEqual([120, 150]);
	});

	it.each([
		[120, 240, '2:00 AM – 4:00 AM'],
		[840, 930, '2:00 PM – 3:30 PM'],
		[720, 780, '12:00 PM – 1:00 PM'],
		[0, 60, '12:00 AM – 1:00 AM']
	])('labels %i–%i as %s', (start, end, expected) => {
		expect(formatRangeLabel(start, end)).toBe(expected);
	});

	it('measures durations and defaults to 60', () => {
		expect(eventDurationMinutes('2026-09-07T10:00:00', '2026-09-07T11:30:00')).toBe(90);
		expect(eventDurationMinutes('2026-09-07T10:00:00', '2026-09-07T10:10:00')).toBe(15);
		expect(eventDurationMinutes('2026-09-07T10:00:00', null)).toBe(60);
		expect(eventDurationMinutes('nope', null)).toBe(60);
	});

	it('moves a one-off as a master edit and a recurring event as scope this', () => {
		const day = DateTime.fromISO('2026-09-07T00:00:00');
		const oneOff = {
			id: 'e1',
			title: 'Lunch',
			start: '2026-09-07T12:00:00',
			end: '2026-09-07T13:00:00',
			description: null,
			location: null,
			recurrenceFrequency: null
		};
		const payload = buildMovePayload(oneOff, { day, minutes: 600 });
		expect(payload.start).toContain('2026-09-07T10:00');
		expect(payload.end).toContain('2026-09-07T11:00');
		expect(payload.scope).toBeUndefined();

		const recurring = buildMovePayload(
			{
				...oneOff,
				id: 'evt12345678901',
				masterId: 'evt12345678901',
				recurrenceFrequency: 'weekly',
				occurrenceDate: '2026-09-07T12:00:00.000Z'
			},
			{ day, minutes: 600 }
		);
		expect(recurring.scope).toBe('this');
		expect(recurring.occurrenceDate).toBe('2026-09-07T12:00:00.000Z');
	});

	it('duplicates with the copy suffix and carries the invitation rows', () => {
		const payload = buildDuplicateEventPayload(
			{
				title: 'Dentist',
				start: '2026-10-07T13:00:00.000Z',
				end: '2026-10-07T14:00:00.000Z',
				description: '',
				location: null,
				allDay: false,
				calendarId: 'calpersonal001',
				reminderMinutes: 30
			},
			[
				{ userId: 'user-partner', inviteType: 'required' },
				{ userId: null, inviteType: 'optional' }
			],
			['Grandma']
		);
		expect(payload.title).toBe('Dentist (copy)');
		expect(payload.description).toBeNull();
		expect(payload.attendees).toEqual([
			{ value: 'user-partner', isUser: true, inviteType: 'required' },
			{ value: 'Grandma', isUser: false, inviteType: 'optional' }
		]);
	});

	it('overlaps a half-open day correctly (#285)', () => {
		const dayStart = new Date('2026-09-07T00:00:00.000Z');
		const nextDay = new Date('2026-09-08T00:00:00.000Z');
		// A span reaching past midnight belongs to both days.
		expect(overlapsDay('2026-09-07T22:00:00.000Z', '2026-09-08T02:00:00.000Z', dayStart, nextDay)).toBe(true);
		// An event ending exactly at 00:00 belongs to the day before.
		expect(overlapsDay('2026-09-06T22:00:00.000Z', '2026-09-07T00:00:00.000Z', dayStart, nextDay)).toBe(false);
		// An end-less event at exactly 00:00 still shows that day.
		expect(overlapsDay('2026-09-07T00:00:00.000Z', null, dayStart, nextDay)).toBe(true);
	});

	it('picks the day-split entry that really overlaps', () => {
		const entries = [
			{ id: 'a', date: new Date('2026-09-07T00:00:00.000Z'), end: new Date('2026-09-07T02:00:00.000Z') },
			{ id: 'b', date: new Date('2026-09-08T00:00:00.000Z'), end: new Date('2026-09-08T00:00:00.000Z') }
		];
		const picked = pickDayEntries(entries, new Date('2026-09-07T00:00:00.000Z'), new Date('2026-09-08T00:00:00.000Z'));
		expect(picked.map((entry) => entry.id)).toEqual(['a']);
	});

	it('matches a calendar by exact then partial name', () => {
		const calendars = [
			{ id: 'cal-1', name: 'Family Calendar' },
			{ id: 'cal-2', name: 'Work' }
		];
		expect(matchCalendarByName(calendars, 'work')?.id).toBe('cal-2');
		expect(matchCalendarByName(calendars, 'family')?.id).toBe('cal-1');
		expect(matchCalendarByName(calendars, 'nothing')).toBeNull();
	});
});

describe('chip vocabulary', () => {
	it('an ad outranks all-day and a timed event is the default', () => {
		expect(chipKind({ allDay: true, isAd: true })).toBe('sponsored');
		expect(chipKind({ allDay: true })).toBe('allDay');
		expect(chipKind({})).toBe('timed');
	});

	it('a sponsored chip is labelled Ad with the hidden phrase Sponsored', () => {
		const shell = describeEventChip({ density: 'glyph', event: { title: 'Sale', isAd: true } });
		expect(shell.kind).toBe('sponsored');
		expect(shell.word).toBe('');
		expect(describeEventChip({ density: 'word', event: { title: 'Sale', isAd: true } }).word).toBe('Ad');
		expect(SPONSORED_A11Y).toBe('Sponsored');
		expect(shell.tooltip).toBe('Sponsored · Sale');
	});

	it('attributes the calendar on the hover hint when there are 2+ calendars', () => {
		const calendars = [
			{ id: 'cal-1', name: 'Personal Calendar' },
			{ id: 'cal-2', name: 'Riveras' }
		];
		const shell = describeEventChip({
			density: 'glyph',
			event: { title: 'Soccer', calendarId: 'cal-2', allDay: true },
			calendars
		});
		expect(shell.tooltip).toBe('All day · Soccer · Riveras');
		expect(describeEventChip({ density: 'word', event: { title: 'Soccer' }, calendars }).tooltip).toBe('');
	});

	it('swaps a task’s slate border for red when overdue', () => {
		expect(
			describeEventChip({ density: 'word', kind: 'task', overdue: true }).containerClass
		).toContain('border-red-400');
	});

	it('splits a multi-day event into one entry per calendar day', () => {
		const entries = splitEventsByDay([
			{ id: 'trip', start: '2026-09-07T22:00:00.000Z', end: '2026-09-08T02:00:00.000Z' }
		], 'utc');
		expect(entries.map((entry) => entry.date.toISOString().slice(0, 10))).toEqual([
			'2026-09-07',
			'2026-09-08'
		]);
	});

	it('builds the share-target text without duplicating the URL', () => {
		expect(buildSharedTargetText('Title', 'Dinner at 6\nwith Sam', 'https://x.test/1')).toBe(
			'Dinner at 6 with Sam https://x.test/1'
		);
		expect(buildSharedTargetText('Title', 'See https://x.test/1', 'https://x.test/1')).toBe(
			'See https://x.test/1'
		);
		expect(buildSharedTargetText('  Title  ', '', '')).toBe('Title');
	});
});

describe('print grid', () => {
	const items = [
		{
			title: 'Dentist',
			color: '#123456',
			allDay: false,
			start: '2026-02-01T09:00:00.000Z',
			date: '2026-02-01T00:00:00.000Z'
		},
		{
			title: 'Piano',
			color: '#123456',
			allDay: false,
			start: '2026-02-03T14:30:00.000Z',
			date: '2026-02-03T00:00:00.000Z'
		},
		{
			title: 'Camping',
			color: '#00ff00',
			allDay: true,
			start: '2026-02-05T00:00:00.000Z',
			date: '2026-02-05T00:00:00.000Z'
		}
	];

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

	it('pads a Monday-first February to 35 cells', () => {
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

	it('rolls prev/next across the year', () => {
		expect(monthNeighbours(2026, 1)).toEqual({ prev: { year: 2025, month: 12 }, next: { year: 2026, month: 2 } });
		expect(monthNeighbours(2026, 12)).toEqual({ prev: { year: 2026, month: 11 }, next: { year: 2027, month: 1 } });
	});

	it('writes short times and blanks an invalid instant', () => {
		expect(shortTime('2026-02-01T09:00:00.000Z', 'utc')).toBe('9a');
		expect(shortTime('2026-02-03T14:30:00.000Z', 'utc')).toBe('2:30p');
		expect(shortTime('2026-02-03T12:00:00.000Z', 'utc')).toBe('12p');
		expect(shortTime('2026-02-03T00:00:00.000Z', 'utc')).toBe('12a');
		expect(shortTime('garbage', 'utc')).toBe('');
	});
});

describe('bulk planner', () => {
	const TODAY = '2026-08-23';
	const EVENTS: BulkEventSummary[] = [
		{ id: 'evt-1', title: 'Dentist', start: '2026-08-23T09:00:00.000Z', location: null },
		{ id: 'evt-2', title: 'Soccer practice', start: '2026-08-24T09:00:00.000Z', location: null },
		{ id: 'evt-3', title: 'Piano', start: '2026-08-25T09:00:00.000Z', location: null }
	];
	const CALS = [
		{ id: 'cal-pers-67890', name: 'Personal Calendar' },
		{ id: 'cal-fam-12345', name: 'Family Calendar' }
	];

	it('moves every selected event to next friday', () => {
		const ops = planBulkEdits('move to next friday', EVENTS, TODAY);
		expect(ops).toHaveLength(3);
		expect(ops[0]).toEqual({ id: 'evt-1', date: '2026-08-28' });
	});

	it('parses tomorrow, today and explicit dates', () => {
		expect(planBulkEdits('move to tomorrow', EVENTS, TODAY)[0]?.date).toBe('2026-08-24');
		expect(planBulkEdits('reschedule to 2026-09-01', EVENTS, TODAY)[0]?.date).toBe('2026-09-01');
		expect(planBulkEdits('move to aug 28', EVENTS, TODAY)[0]?.date).toBe('2026-08-28');
	});

	it('parses this weekend as the upcoming Saturday', () => {
		expect(planBulkEdits('move to this weekend', EVENTS, TODAY).every((op) => op.date === '2026-08-29')).toBe(true);
	});

	it('sets a time from "at 3pm" and keeps the date', () => {
		const op = planBulkEdits('move to 3pm', EVENTS, TODAY)[0];
		expect(op?.startTime).toBe('15:00');
		expect(op?.date).toBeUndefined();
	});

	it('deletes when asked and prefers the date move when a delete verb rides along', () => {
		expect(planBulkEdits('delete these', EVENTS, TODAY)).toEqual([
			{ id: 'evt-1', delete: true },
			{ id: 'evt-2', delete: true },
			{ id: 'evt-3', delete: true }
		]);
		const ops = planBulkEdits('cancel the picnic and move to monday', EVENTS, TODAY);
		expect(ops.every((op) => op.date === '2026-08-24' && !op.delete)).toBe(true);
	});

	it('targets only named events and strips their titles before reading verbs', () => {
		expect(planBulkEdits('move soccer practice to friday', EVENTS, TODAY)).toEqual([
			{ id: 'evt-2', date: '2026-08-28' }
		]);
		const trash: BulkEventSummary[] = [
			{ id: 'evt-trash', title: 'Trash pickup reminder', start: '2026-08-26T08:00:00.000Z', location: null }
		];
		expect(planBulkEdits('move Trash pickup reminder to friday', trash, TODAY)).toEqual([
			{ id: 'evt-trash', date: '2026-08-28' }
		]);
	});

	it('matches a calendar by name and respects word boundaries', () => {
		expect(planBulkEdits('move to family calendar', EVENTS, TODAY, CALS)[0]?.calendarId).toBe(
			'cal-fam-12345'
		);
		expect(
			planBulkEdits('move to personal calendar next friday', EVENTS, TODAY, CALS)[0]
		).toEqual({ id: 'evt-1', date: '2026-08-28', calendarId: 'cal-pers-67890' });
		expect(
			planBulkEdits('move to latest friday', EVENTS, TODAY, [{ id: 'cal-test-12345', name: 'test' }])[0]
				?.calendarId
		).toBeUndefined();
	});

	it('returns [] when nothing matches', () => {
		expect(planBulkEdits('make it purple', EVENTS, TODAY)).toEqual([]);
	});

	it('resolves anchored times only', () => {
		expect(resolveBulkTime('move to 3pm')).toBe('15:00');
		expect(resolveBulkTime('at 15:00')).toBe('15:00');
		expect(resolveBulkTime('august 15 at 6pm')).toBe('18:00');
		expect(resolveBulkTime('move to september 9')).toBeNull();
	});

	it('resolves dates from a delete-word instruction without stealing a day-of-month', () => {
		const today = DateTime.fromISO(TODAY);
		expect(resolveBulkDate('delete the 3rd item', today, true)).toBeNull();
		expect(resolveBulkDate('move to the 3rd', today, false)).toBe('2026-09-03');
	});

	it('resolves calendars by full name then by its stem', () => {
		expect(resolveBulkCalendar('move to family', CALS)).toBe('cal-fam-12345');
		expect(resolveBulkCalendar('nothing here', CALS)).toBeNull();
	});

	it('validates a posted plan against editable ids', () => {
		const allowed = ['evt-1', 'evt-2', 'evt-3'];
		expect(
			parseBulkPlan(
				JSON.stringify({
					ops: [
						{ id: 'evt-1', title: 'Soccer practice', date: '2026-09-04' },
						{ id: 'evt-2', location: 'Community Hall' }
					]
				}),
				allowed
			)
		).toEqual([
			{ id: 'evt-1', title: 'Soccer practice', date: '2026-09-04' },
			{ id: 'evt-2', location: 'Community Hall' }
		]);
		expect(parseBulkPlan(JSON.stringify([{ id: 'evt-3', startTime: '9:30' }]), allowed)).toEqual([
			{ id: 'evt-3', startTime: '09:30' }
		]);
		expect(
			parseBulkPlan(JSON.stringify([{ id: 'evt-999', title: 'Drop' }, { id: 'evt-1', date: 'September 4th' }, { id: 'evt-2' }]), allowed)
		).toEqual([]);
	});
});
