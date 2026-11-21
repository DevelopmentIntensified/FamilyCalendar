/**
 * The detail region's words and buckets, carried from
 * `EventDetailList.svelte`, `EventAttendeeGroups.svelte`'s module half,
 * `EventRecurrenceCard.svelte` (`describeSeries`), `utils/attendance.ts` and
 * `utils/eventDuplicate.ts`.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
	calendarAttendancePeople,
	calendarAttendanceSplit,
	calendarAttendanceStatus,
	calendarClockTime,
	calendarContactColor,
	calendarDeleteScopes,
	calendarDuplicateBody,
	calendarEventDay,
	calendarEventEndTime,
	calendarEventStartTime,
	calendarFormatTime,
	calendarGuestAttendance,
	calendarNameForEvent,
	calendarPersonName,
	calendarReminderLabel,
	calendarSeriesFacts,
	type CalendarAttendanceRow,
	type CalendarEventView
} from './calendar.eventView.rules';

const event: CalendarEventView = {
	id: 'master~2026-02-03T10:00:00.000Z',
	masterId: 'master',
	occurrenceDate: '2026-02-03T10:00:00.000Z',
	title: 'Dentist',
	start: '2026-02-03T10:00:00.000Z',
	end: '2026-02-03T11:00:00.000Z',
	location: 'High Street',
	description: 'Bring the form',
	allDay: false,
	calendarId: 'cal-1',
	color: '#fa8072',
	recurrenceFrequency: 'weekly',
	recurrenceInterval: 1,
	reminderMinutes: 60
};

describe('calendarFormatTime (EventDetailList.svelte:26-32)', () => {
	it.each([
		['09:00', '9:00 AM'],
		['00:00', '12:00 AM'],
		['12:00', '12:00 PM'],
		['13:05', '1:05 PM'],
		['', '']
	])('renders %s as %s', (input, expected) => {
		expect(calendarFormatTime(input)).toBe(expected);
	});
});

describe('calendarReminderLabel (EventDetailList.svelte:34-46)', () => {
	it.each([
		[null, null],
		[0, null],
		[1, '1 minute before'],
		[45, '45 minutes before'],
		[60, '1 hour before'],
		[180, '3 hours before'],
		[1440, '1 day before'],
		[2880, '2 days before']
	])('renders %s minutes as %s', (minutes, expected) => {
		expect(calendarReminderLabel(minutes)).toBe(expected);
	});
});

describe('event times and day', () => {
	it('prefers the day-split row’s own overrides', () => {
		expect(calendarEventStartTime({ ...event, startTime: '22:00' })).toBe('22:00');
		expect(calendarEventEndTime({ ...event, endTime: '23:30' })).toBe('23:30');
	});
	it('prints the clock time of an instant when there is no override', () => {
		expect(calendarClockTime('2026-02-03T10:00:00.000Z')).toMatch(/^\d{2}:\d{2}$/);
		expect(calendarClockTime('not a date')).toBeUndefined();
	});
	it('uses `date` for the printed day when the row was split onto one', () => {
		const day = calendarEventDay({ ...event, date: '2026-02-04T00:00:00.000Z' });
		expect(day?.toISOString()).toBe('2026-02-04T00:00:00.000Z');
		expect(calendarEventDay(event)?.toISOString()).toBe('2026-02-03T10:00:00.000Z');
	});
});

describe('calendarNameForEvent (EventModal.svelte:183-186)', () => {
	it('takes the event’s own calendar name, then the picker’s, then a placeholder', () => {
		expect(
			calendarNameForEvent(
				{ ...event, calendar: { name: 'Family Calendar' } },
				[{ id: 'cal-1', name: 'Personal Calendar' }]
			)
		).toBe('Family Calendar');
		expect(calendarNameForEvent(event, [{ id: 'cal-1', name: 'Personal Calendar' }])).toBe(
			'Personal Calendar'
		);
		expect(calendarNameForEvent(event, [])).toBe('Calendar');
		expect(calendarNameForEvent({ ...event, calendarId: null }, [])).toBe('');
	});
});

describe('calendarSeriesFacts (EventRecurrenceCard.svelte:37-67)', () => {
	const now = DateTime.fromISO('2026-03-17T10:00:00');
	it('words a weekly series with its elapsed occurrences', () => {
		expect(calendarSeriesFacts(event, now)).toEqual({
			rule: 'Every week on Tuesdays',
			since: '7 occurrences since Feb 2026',
			count: 7
		});
	});
	it('words an interval above one in the plural unit', () => {
		expect(
			calendarSeriesFacts({ ...event, recurrenceFrequency: 'daily', recurrenceInterval: 2 }, now)
				?.rule
		).toBe('Every 2 days on Tuesdays');
	});
	it('says "Starts …" before the first occurrence', () => {
		expect(
			calendarSeriesFacts({ ...event, start: '2026-04-07T10:00:00.000Z' }, now)?.since
		).toMatch(/^Starts Apr 7, 2026$/);
	});
	it('is null when the event does not repeat or the frequency is unknown', () => {
		expect(calendarSeriesFacts({ ...event, recurrenceFrequency: null }, now)).toBeNull();
		expect(calendarSeriesFacts({ ...event, recurrenceFrequency: 'fortnightly' }, now)).toBeNull();
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

	it('draws members first, then guests, each with its bucket', () => {
		const people = calendarAttendancePeople(calendarAttendanceSplit(rows), [
			{ name: 'Nan', status: 'going', inviteType: null }
		]);
		expect(people.map((person) => [person.name, person.bucket])).toEqual([
			['Mira', 'going'],
			['u2', 'maybe'],
			['u3', 'declined'],
			['u4', 'declined'],
			['u5', 'pending'],
			['u6', 'pending'],
			['Nan', 'pending']
		]);
	});

	it('labels a row from its own status first and its bucket as the fallback', () => {
		expect(calendarAttendanceStatus('undecided', 'pending')).toBe('invited');
		expect(calendarAttendanceStatus('going', 'pending')).toBe('going');
		expect(calendarAttendanceStatus(null, 'declined')).toBe('declined');
		expect(calendarAttendanceStatus('guest', 'pending')).toBe('pending');
	});

	it('names a row first+last, then its guest name, then its id', () => {
		expect(calendarPersonName({ userId: 'u1', status: 'going', firstName: 'Mira', lastName: 'K' })).toBe('Mira K');
		expect(calendarPersonName({ userId: null, status: 'invited', name: 'Nan' })).toBe('Nan');
		expect(calendarPersonName({ userId: 'u9', status: 'going' })).toBe('u9');
		expect(calendarPersonName({ userId: null, status: 'invited' })).toBe('Unknown');
	});

	it('falls back to one invited row per guest name when no statuses came', () => {
		expect(calendarGuestAttendance(null, ['Nan', 'Ada'])).toEqual([
			{ name: 'Nan', status: 'invited', inviteType: null },
			{ name: 'Ada', status: 'invited', inviteType: null }
		]);
		expect(calendarGuestAttendance([{ name: 'Nan', status: 'going' }], [])).toEqual([
			{ name: 'Nan', status: 'going', inviteType: null }
		]);
	});
});

describe('calendarDeleteScopes (EventModal.svelte:101-104)', () => {
	it('offers both halves only when an occurrence is open', () => {
		expect(calendarDeleteScopes(true)).toEqual(['this', 'all']);
		expect(calendarDeleteScopes(false)).toEqual(['all']);
	});
});

describe('calendarDuplicateBody (utils/eventDuplicate.ts:29-60)', () => {
	it('copies the event as "… (copy)" with its invites, members keeping their role', () => {
		const body = calendarDuplicateBody(
			{ ...event, recurrenceInterval: 2 },
			[
				{ userId: 'u1', status: 'going', inviteType: 'required' },
				{ userId: 'u2', status: 'maybe' }
			],
			['Nan']
		);
		expect(body.title).toBe('Dentist (copy)');
		expect(body.start).toBe('2026-02-03T10:00:00.000Z');
		expect(body.end).toBe('2026-02-03T11:00:00.000Z');
		expect(body.attendees).toEqual([
			{ value: 'u1', isUser: true, inviteType: 'required' },
			{ value: 'u2', isUser: true, inviteType: 'optional' },
			{ value: 'Nan', isUser: false, inviteType: 'optional' }
		]);
		expect(body.recurrenceFrequency).toBe('weekly');
		expect(body.reminderMinutes).toBe(60);
	});
});

describe('calendarContactColor (getContactColor)', () => {
	it('is stable per name and lands on the eight swatches', () => {
		expect(calendarContactColor('Mira')).toEqual(calendarContactColor('Mira'));
		expect(calendarContactColor('Mira').bg).toMatch(/^#[0-9a-f]{6}$/);
	});
});
