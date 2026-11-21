/**
 * The event form's rules, carried from `EventFormModel.svelte.ts`:
 * `populateFromEvent`, `toTimestamp`, `endBeforeStart`/`endDateBeforeStart`,
 * `toEventData` (all-day, multi-day, the +1 hour default, recurrence gating,
 * invite replace-all gating), `applyNlpResult` + `clearUntouchedNlpFields`,
 * `shiftEventDates` and `actionError.ts`.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	calendarActionErrorCopy,
	calendarApplyParse,
	calendarCanSubmit,
	calendarEmptyForm,
	calendarEndBeforeStart,
	calendarEndDateBeforeStart,
	calendarEventBody,
	calendarFormFromEvent,
	calendarNlpFrequency,
	calendarShiftEventDates,
	calendarTimestamp,
	type CalendarEventFormFields,
	type CalendarEventBody,
	type CalendarFormDraft
} from './calendar.eventForm.rules';

const isMember = (value: string) => value.startsWith('u-');

function draftOf(fields: Partial<CalendarEventFormFields> = {}): CalendarFormDraft {
	return { fields: calendarEmptyForm(fields), touched: {}, detected: {}, lastNlp: {} };
}

describe('calendarFormFromEvent (EventFormModel.svelte.ts:213-268)', () => {
	it('fills the fields from an occurrence, keeping multi-day and reminder', () => {
		const { fields, invitedUserIds } = calendarFormFromEvent(
			{
				title: 'Trip',
				description: 'Pack',
				location: 'Lake',
				calendarId: 'cal-1',
				start: '2026-02-03T10:00:00.000Z',
				end: '2026-02-04T11:30:00.000Z',
				allDay: false,
				attendees: [
					{ value: 'u-1', isUser: true, inviteType: 'required' },
					{ value: 'Nan', isUser: false }
				],
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 2,
				recurrenceByDay: ['TU'],
				reminderMinutes: 60
			},
			[{ id: 'cal-1', name: 'Personal' }]
		);
		expect(fields.title).toBe('Trip');
		expect(fields.selectedCalendarId).toBe('cal-1');
		expect(fields.date).toBe('2026-02-03');
		expect(fields.multiDay).toBe(true);
		expect(fields.endDate).toBe('2026-02-04');
		expect(fields.attendants).toEqual(['u-1', 'Nan']);
		expect(fields.inviteTypes).toEqual({ 'u-1': 'required' });
		expect(invitedUserIds).toEqual(['u-1']);
		expect(fields.recurrenceInterval).toBe(2);
		expect(fields.recurrenceByDay).toEqual(['TU']);
		expect(fields.reminderMinutes).toBe(60);
	});

	it('falls back to the first visible calendar when the stored one is gone', () => {
		const { fields } = calendarFormFromEvent(
			{ title: 'X', calendarId: 'cal-gone', start: '2026-02-03T10:00:00.000Z' },
			[
				{ id: 'cal-a', name: 'A' },
				{ id: 'cal-b', name: 'B' }
			]
		);
		expect(fields.selectedCalendarId).toBe('cal-a');
	});

	it('gives a blank create form the explicit default, else the first calendar', () => {
		const calendars = [
			{ id: 'cal-a', name: 'A' },
			{ id: 'cal-b', name: 'B' }
		];
		expect(calendarFormFromEvent({}, calendars, 'cal-b').fields.selectedCalendarId).toBe('cal-b');
		expect(calendarFormFromEvent({}, calendars, 'cal-gone').fields.selectedCalendarId).toBe(
			'cal-a'
		);
	});
});

describe('calendarNlpFrequency (EventFormModel.svelte.ts:115-138)', () => {
	it.each([
		['biweekly', { frequency: 'weekly', interval: 2 }],
		['every_3_weeks', { frequency: 'weekly', interval: 3 }],
		['every_2_months', { frequency: 'monthly', interval: 2 }],
		['every_1_year', { frequency: 'yearly', interval: 1 }],
		['monthly', { frequency: 'monthly', interval: 1 }],
		['every_0_days', { frequency: 'daily', interval: 1 }],
		['yearly', { frequency: 'yearly', interval: 1 }],
		['fortnightly', null]
	])('maps %s', (token, expected) => {
		expect(calendarNlpFrequency(token)).toEqual(expected);
	});
});

describe('calendarTimestamp (EventFormModel.svelte.ts:299-305)', () => {
	it('is null without a date', () => {
		expect(calendarTimestamp('', '10:00', false)).toBeNull();
	});
	it('takes the day’s midnight for an all-day value', () => {
		const iso = calendarTimestamp('2026-02-03', '10:00', true);
		expect(iso).toMatch(/^2026-02-03T00:00:00/);
	});
	it('takes the clock time otherwise', () => {
		const iso = calendarTimestamp('2026-02-03', '10:00', false);
		expect(new Date(iso ?? '').getHours()).toBe(10);
	});
});

describe('end order (EventFormModel.svelte.ts:474-489)', () => {
	it('flags an end time before the start time on one day', () => {
		expect(calendarEndBeforeStart(calendarEmptyForm({ date: '2026-02-03', startTime: '11:00', endTime: '10:00' }))).toBe(true);
		expect(calendarEndBeforeStart(calendarEmptyForm({ date: '2026-02-03', startTime: '10:00', endTime: '11:00' }))).toBe(false);
		expect(
			calendarEndBeforeStart(
				calendarEmptyForm({ date: '2026-02-03', startTime: '11:00', endTime: '10:00', allDay: true })
			)
		).toBe(false);
	});
	it('flags a multi-day end date before the start date', () => {
		expect(
			calendarEndDateBeforeStart(
				calendarEmptyForm({ date: '2026-02-03', multiDay: true, endDate: '2026-02-02' })
			)
		).toBe(true);
		expect(
			calendarEndDateBeforeStart(
				calendarEmptyForm({ date: '2026-02-03', multiDay: true, endDate: '2026-02-03' })
			)
		).toBe(false);
	});
	it('gates submit on title + date + both order checks', () => {
		expect(calendarCanSubmit(calendarEmptyForm({ title: 'X', date: '2026-02-03' }))).toBe(true);
		expect(calendarCanSubmit(calendarEmptyForm({ title: '', date: '2026-02-03' }))).toBe(false);
		expect(
			calendarCanSubmit(calendarEmptyForm({ title: 'X', date: '2026-02-03', startTime: '11:00', endTime: '10:00' }))
		).toBe(false);
	});
});

describe('calendarEventBody (EventFormModel.svelte.ts:612-679)', () => {
	const base = { title: 'Dentist', date: '2026-02-03' };
	const options = { isEdit: false, invitesLoaded: false, isMember };

	it('is null without a title or date', () => {
		expect(calendarEventBody(calendarEmptyForm({ date: '2026-02-03' }), options)).toBeNull();
		expect(calendarEventBody(calendarEmptyForm({ title: 'X' }), options)).toBeNull();
	});

	it('saves title + date alone as all-day, midnight to midnight', () => {
		const body = calendarEventBody(calendarEmptyForm(base), options);
		expect(body?.allDay).toBe(true);
		expect(body?.end).toBeNull();
		expect(body?.start).toMatch(/^2026-02-03T00:00:00/);
	});

	it('gives a timed event without an end exactly one hour', () => {
		const body = calendarEventBody(
			calendarEmptyForm({ ...base, startTime: '10:00' }),
			options
		);
		expect(body?.allDay).toBe(false);
		expect(new Date(body?.end ?? '').getTime() - new Date(body?.start ?? '').getTime()).toBe(
			3_600_000
		);
	});

	it('ends a multi-day all-day event on the last day', () => {
		const body = calendarEventBody(
			calendarEmptyForm({ ...base, multiDay: true, endDate: '2026-02-05' }),
			options
		);
		expect(body?.allDay).toBe(true);
		// Legacy `toTimestamp(date, '', allDay)` is that day's midnight, kept as-is.
		expect(body?.end).toMatch(/^2026-02-05T00:00:00/);
	});

	it('sends recurrence columns only while a frequency is set', () => {
		const off = calendarEventBody(
			calendarEmptyForm({ ...base, recurrenceInterval: 3, recurrenceByDay: ['MO'] }),
			options
		);
		expect(off?.recurrenceFrequency).toBeNull();
		expect(off?.recurrenceInterval).toBeNull();
		expect(off?.recurrenceByDay).toBeNull();
		const on = calendarEventBody(
			calendarEmptyForm({ ...base, recurrenceFrequency: 'weekly', recurrenceInterval: 3 }),
			options
		);
		expect(on?.recurrenceFrequency).toBe('weekly');
		expect(on?.recurrenceInterval).toBe(3);
	});

	it('sends invites on a create, but not on an edit whose invites never loaded', () => {
		const created = calendarEventBody(calendarEmptyForm(base), options);
		expect(created?.attendees).toEqual([]);
		const editWithoutLoad = calendarEventBody(calendarEmptyForm(base), {
			isEdit: true,
			invitesLoaded: false,
			isMember
		});
		expect(editWithoutLoad?.attendees).toBeUndefined();
		const editLoaded = calendarEventBody(
			calendarEmptyForm({ ...base, attendants: ['u-1', 'Nan'], inviteTypes: { 'u-1': 'required' } }),
			{ isEdit: true, invitesLoaded: true, isMember }
		);
		expect(editLoaded?.attendees).toEqual([
			{ value: 'u-1', isUser: true, inviteType: 'required' },
			{ value: 'Nan', isUser: false, inviteType: 'optional' }
		]);
	});
});

describe('calendarApplyParse (EventFormModel.svelte.ts:452-604)', () => {
	it('fills the untouched fields and marks them detected', () => {
		const draft = calendarApplyParse(draftOf(), {
			title: 'Lunch',
			date: '2026-02-06',
			startTime: '12:00',
			location: 'Cafe',
			attendants: ['Nan']
		});
		expect(draft.fields.title).toBe('Lunch');
		expect(draft.fields.date).toBe('2026-02-06');
		expect(draft.fields.startTime).toBe('12:00');
		expect(draft.fields.allDay).toBe(false);
		expect(draft.fields.location).toBe('Cafe');
		expect(draft.fields.attendants).toEqual(['Nan']);
		expect(draft.detected.title).toBe(true);
		expect(draft.lastNlp.date).toBe('2026-02-06');
	});

	it('never overwrites what the user touched', () => {
		const draft = calendarApplyParse(draftOf({ title: 'Mine', date: '2026-02-09' }), {
			title: 'Theirs',
			date: '2026-02-10'
		});
		expect(draft.fields.title).toBe('Theirs');
		const touched: CalendarFormDraft = {
			...draftOf({ title: 'Mine', date: '2026-02-09' }),
			touched: { title: true, date: true }
		};
		const kept = calendarApplyParse(touched, { title: 'Theirs', date: '2026-02-10' });
		expect(kept.fields.title).toBe('Mine');
		expect(kept.fields.date).toBe('2026-02-09');
	});

	it('clears the previous parse’s untouched values before applying a new one', () => {
		const first = calendarApplyParse(draftOf(), {
			title: 'Lunch',
			location: 'Cafe',
			startTime: '12:00'
		});
		const second = calendarApplyParse(first, { title: 'Dinner' });
		expect(second.fields.title).toBe('Dinner');
		expect(second.fields.location).toBe('');
		expect(second.fields.startTime).toBe('');
		expect(second.fields.allDay).toBe(true);
	});

	it('maps a recurrence phrase onto the picker', () => {
		const draft = calendarApplyParse(draftOf(), { recurring: 'biweekly' });
		expect(draft.fields.recurrenceFrequency).toBe('weekly');
		expect(draft.fields.recurrenceInterval).toBe(2);
		expect(draft.detected.recurrence).toBe(true);
	});

	it('keeps an existing frequency and an existing reminder', () => {
		const draft = calendarApplyParse(
			draftOf({ recurrenceFrequency: 'monthly', reminderMinutes: 30 }),
			{ recurring: 'daily', reminderMinutes: 60 }
		);
		expect(draft.fields.recurrenceFrequency).toBe('monthly');
		expect(draft.fields.reminderMinutes).toBe(30);
	});

	it('turns a date-only allDay phrase off when a time arrives', () => {
		const draft = calendarApplyParse(draftOf({ allDay: true }), { startTime: '09:30' });
		expect(draft.fields.allDay).toBe(false);
	});
});

describe('calendarShiftEventDates (EventFormModel.svelte.ts:36-56)', () => {
	const body: CalendarEventBody = {
		title: 'Lunch',
		start: '2026-02-06T12:00:00.000Z',
		end: '2026-02-06T13:00:00.000Z',
		location: '',
		description: '',
		calendarId: 'cal-1',
		allDay: false,
		recurrenceFrequency: null,
		recurrenceInterval: null,
		recurrenceByDay: null,
		recurrenceCount: null,
		recurrenceUntil: null,
		reminderMinutes: null
	};
	it('shifts each extra date by its offset from the first', () => {
		const shifted = calendarShiftEventDates(body, ['2026-02-06', '2026-02-09', '2026-02-20']);
		expect(shifted.map((item) => item.start)).toEqual([
			'2026-02-09T12:00:00.000Z',
			'2026-02-20T12:00:00.000Z'
		]);
		expect(shifted[0].end).toBe('2026-02-09T13:00:00.000Z');
	});
	it('shifts nothing for one date or none', () => {
		expect(calendarShiftEventDates(body, ['2026-02-06'])).toEqual([]);
		expect(calendarShiftEventDates(body, undefined)).toEqual([]);
	});
});

describe('calendarActionErrorCopy (utils/actionError.ts:8-27)', () => {
	it('shows the server message when there is one', () => {
		expect(calendarActionErrorCopy('delete', 'Event not accessible', 403)).toBe(
			'Event not accessible'
		);
	});
	it.each([
		['delete', 401, "Couldn't delete the event. Your session expired. Sign in, then try again."],
		[
			'create',
			500,
			"Couldn't create the event. Check your connection (a VPN can block it), then try again."
		],
		['save', 400, "Couldn't save your changes. Check the details you entered, then try again."],
		[
			'duplicate',
			undefined,
			"Couldn't duplicate the event. Check your connection (a VPN can block it), then try again."
		]
	] as const)('falls back for %s at %s', (action, status, expected) => {
		expect(calendarActionErrorCopy(action, null, status)).toBe(expected);
	});
});
