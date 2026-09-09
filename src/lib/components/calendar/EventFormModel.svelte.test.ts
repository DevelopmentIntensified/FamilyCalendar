import { describe, it, expect } from 'vitest';
import { createEventForm, shiftEventDates, type FormEventData } from './EventFormModel.svelte';

describe('EventFormModel - toEventData', () => {
	it('should include attendants in toEventData output', () => {
		const form = createEventForm({
			calendars: [{ id: 'cal1', name: 'My Calendar' }],
			familyMembers: [],
			defaultCalendarId: 'cal1',
			initialEvent: undefined
		});

		form.title = 'Test Event';
		form.date = '2026-07-17';
		form.toggleAttendant('Alice');
		form.toggleAttendant('Bob');

		const data = form.toEventData();
		expect(data).not.toBeNull();
		expect(data!.attendants).toEqual(['Alice', 'Bob']);
	});

	it('should include empty attendants when none added', () => {
		const form = createEventForm({
			calendars: [{ id: 'cal1', name: 'My Calendar' }],
			familyMembers: [],
			defaultCalendarId: 'cal1',
			initialEvent: undefined
		});

		form.title = 'Test Event';
		form.date = '2026-07-17';

		const data = form.toEventData();
		expect(data).not.toBeNull();
		expect(data!.attendants).toEqual([]);
	});

	it('should populate attendants from initialEvent in edit mode', () => {
		const form = createEventForm({
			calendars: [{ id: 'cal1', name: 'My Calendar' }],
			familyMembers: [],
			defaultCalendarId: 'cal1',
			initialEvent: {
				id: 'evt1',
				title: 'Edit Test',
				description: '',
				location: 'Office',
				calendarId: 'cal1',
				start: '2026-07-17T10:00:00Z',
				end: '2026-07-17T11:00:00Z',
				allDay: false,
				attendants: ['Alice', 'Bob']
			}
		});

		const data = form.toEventData();
		expect(data).not.toBeNull();
		expect(data!.attendants).toEqual(['Alice', 'Bob']);
		expect(data!.location).toBe('Office');
	});
});

describe('EventFormModel - endDateBeforeStart', () => {
	function makeForm() {
		return createEventForm({
			calendars: [{ id: 'cal1', name: 'My Calendar' }],
			familyMembers: [],
			defaultCalendarId: 'cal1',
			initialEvent: undefined
		});
	}

	it('is true when the end date is before the start date', () => {
		const form = makeForm();
		form.date = '2026-07-17';
		form.multiDay = true;
		form.endDate = '2026-07-16';
		expect(form.endDateBeforeStart).toBe(true);
	});

	it('is false when the end date equals or follows the start date', () => {
		const form = makeForm();
		form.date = '2026-07-17';
		form.multiDay = true;
		form.endDate = '2026-07-17';
		expect(form.endDateBeforeStart).toBe(false);
		form.endDate = '2026-07-18';
		expect(form.endDateBeforeStart).toBe(false);
	});

	it('is false when multi-day is off or the end date is empty', () => {
		const form = makeForm();
		form.date = '2026-07-17';
		form.endDate = '2026-07-16';
		expect(form.endDateBeforeStart).toBe(false);
		form.multiDay = true;
		form.endDate = '';
		expect(form.endDateBeforeStart).toBe(false);
	});

	it('blocks submitPreparation on a backwards end date even with no times', () => {
		const form = makeForm();
		form.title = 'Backwards';
		form.date = '2026-07-17';
		form.multiDay = true;
		form.endDate = '2026-07-16';
		expect(form.submitPreparation()).toBeNull();
	});
});

describe('EventFormModel - invite prefill round-trip', () => {
	const editConfig = {
		calendars: [{ id: 'cal1', name: 'My Calendar' }],
		familyMembers: [{ userId: 'u1', firstName: 'Alice', email: 'alice@example.com' }],
		defaultCalendarId: 'cal1'
	};

	const editEvent = {
		id: 'mstr1',
		title: 'Yoga',
		description: '',
		location: '',
		calendarId: 'cal1',
		start: '2026-07-17T10:00:00Z',
		allDay: false
	};

	const rsvpRows = [
		{ userId: 'u1', status: 'going', firstName: 'Alice', inviteType: 'required' },
		{ userId: null, name: 'Grandma Rose', status: 'undecided', inviteType: 'optional' }
	];

	it('round-trips prefilled invites into structured attendees', () => {
		const form = createEventForm({ ...editConfig, initialEvent: editEvent });
		form.prefillInvites(rsvpRows);

		const data = form.toEventData();
		expect(data!.attendees).toEqual([
			{ value: 'u1', isUser: true, inviteType: 'required' },
			{ value: 'Grandma Rose', isUser: false, inviteType: 'optional' }
		]);
		expect(data!.attendants).toEqual(['u1', 'Grandma Rose']);
	});

	it('omits attendee fields in edit mode when invites never loaded (no silent wipe)', () => {
		const form = createEventForm({ ...editConfig, initialEvent: editEvent });
		const data = form.toEventData();
		expect(data!.attendees).toBeUndefined();
		expect(data!.attendants).toBeUndefined();
	});

	it('sends an explicit empty attendee list once invites loaded (user cleared all)', () => {
		const form = createEventForm({ ...editConfig, initialEvent: editEvent });
		form.prefillInvites(rsvpRows);
		form.toggleAttendant('u1');
		form.toggleAttendant('Grandma Rose');
		const data = form.toEventData();
		expect(data!.attendees).toEqual([]);
	});
});

describe('EventFormModel - recurrence passthrough on edit', () => {
	it('populates byDay/count/until from initialEvent and round-trips them', () => {
		const form = createEventForm({
			calendars: [{ id: 'cal1', name: 'My Calendar' }],
			familyMembers: [],
			defaultCalendarId: 'cal1',
			initialEvent: {
				id: 'mstr1',
				title: 'Yoga',
				description: '',
				location: '',
				calendarId: 'cal1',
				start: '2026-07-17T10:00:00Z',
				allDay: false,
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1,
				recurrenceByDay: ['MO', 'WE'],
				recurrenceCount: 5,
				recurrenceUntil: '2026-12-31T00:00:00.000Z'
			}
		});
		const data = form.toEventData();
		expect(data!.recurrenceByDay).toEqual(['MO', 'WE']);
		expect(data!.recurrenceCount).toBe(5);
		expect(data!.recurrenceUntil).toBe('2026-12-31T00:00:00.000Z');
	});
});

describe('EventFormModel - NLP recurrence', () => {
	const setup = () =>
		createEventForm({
			calendars: [{ id: 'cal1', name: 'My Calendar' }],
			familyMembers: [],
			defaultCalendarId: 'cal1',
			initialEvent: undefined
		});

	it('maps weekly + by-day + count into the payload', () => {
		const form = setup();
		form.title = 'Yoga';
		form.date = '2026-09-07';
		form.applyNlpResult({ recurring: 'weekly', recurringByDay: ['MO', 'WE'], recurringCount: 6 });
		const data = form.toEventData();
		expect(data!.recurrenceFrequency).toBe('weekly');
		expect(data!.recurrenceInterval).toBe(1);
		expect(data!.recurrenceByDay).toEqual(['MO', 'WE']);
		expect(data!.recurrenceCount).toBe(6);
	});

	it('maps until dates into the payload', () => {
		const form = setup();
		form.title = 'Yoga';
		form.date = '2026-09-07';
		form.applyNlpResult({ recurring: 'weekly', recurringUntil: '2026-12-15' });
		expect(form.toEventData()!.recurrenceUntil).toBe('2026-12-15');
	});

	it('maps every_3_days to daily x3 and biweekly to weekly x2', () => {
		const a = setup();
		a.title = 'Meds';
		a.date = '2026-09-07';
		a.applyNlpResult({ recurring: 'every_3_days' });
		expect(a.toEventData()!.recurrenceFrequency).toBe('daily');
		expect(a.toEventData()!.recurrenceInterval).toBe(3);

		const b = setup();
		b.title = 'Payday';
		b.date = '2026-09-07';
		b.applyNlpResult({ recurring: 'biweekly' });
		expect(b.toEventData()!.recurrenceFrequency).toBe('weekly');
		expect(b.toEventData()!.recurrenceInterval).toBe(2);
	});

	it('leaves a user-set frequency alone', () => {
		const form = setup();
		form.title = 'Yoga';
		form.date = '2026-09-07';
		form.recurrenceFrequency = 'monthly';
		form.applyNlpResult({ recurring: 'weekly', recurringCount: 6 });
		const data = form.toEventData();
		expect(data!.recurrenceFrequency).toBe('monthly');
		expect(data!.recurrenceCount).toBeNull();
	});

	it('omits recurrence fields for one-off events', () => {
		const form = setup();
		form.title = 'Dinner';
		form.date = '2026-09-07';
		form.applyNlpResult({ title: 'Dinner' });
		const data = form.toEventData();
		expect(data!.recurrenceFrequency).toBeNull();
		expect(data!.recurrenceByDay).toBeNull();
		expect(data!.recurrenceCount).toBeNull();
		expect(data!.recurrenceUntil).toBeNull();
	});

	it('prefills reminder minutes from the edited event and round-trips them', () => {
		const form = createEventForm({
			calendars: [{ id: 'cal1', name: 'My Calendar' }],
			familyMembers: [],
			defaultCalendarId: 'cal1',
			initialEvent: {
				id: 'evt1',
				title: 'Dentist',
				description: '',
				location: '',
				calendarId: 'cal1',
				start: '2026-09-07T15:00:00Z',
				end: '2026-09-07T16:00:00Z',
				allDay: false,
				reminderMinutes: 30
			}
		});
		expect(form.reminderMinutes).toBe(30);
		expect(form.toEventData()!.reminderMinutes).toBe(30);
		form.reminderMinutes = null;
		expect(form.toEventData()!.reminderMinutes).toBeNull();
	});

	it('takes reminder minutes from quick-add', () => {
		const form = setup();
		form.title = 'Dentist';
		form.date = '2026-09-07';
		form.applyNlpResult({ reminderMinutes: 60 });
		expect(form.toEventData()!.reminderMinutes).toBe(60);
	});

	it('treats title+date with no time as an all-day event', () => {
		const form = setup();
		form.title = 'Dentist';
		form.date = '2026-09-07';
		const data = form.toEventData();
		expect(data!.allDay).toBe(true);
		expect(data!.start).toContain('2026-09-07T00:00');
		expect(data!.end).toBeNull();
	});

	it('keeps timed events timed when a start time is set', () => {
		const form = setup();
		form.title = 'Dentist';
		form.date = '2026-09-07';
		form.startTime = '15:00';
		form.endTime = '16:00';
		const data = form.toEventData();
		expect(data!.allDay).toBe(false);
		expect(data!.start).toContain('2026-09-07T15:00');
		expect(data!.end).toContain('2026-09-07T16:00');
	});
});

describe('EventFormModel - default calendar selection chain', () => {
	const twoCalendars = [
		{ id: 'personal', name: 'Personal Calendar' },
		{ id: 'family', name: 'Family Calendar' }
	];

	it('new event uses userSettings.defaultCalendarId when set', () => {
		const form = createEventForm({
			calendars: twoCalendars,
			familyMembers: [],
			defaultCalendarId: 'family'
		});
		expect(form.selectedCalendarId).toBe('family');
	});

	it('new event falls back to calendars[0] when default is not in the list', () => {
		const form = createEventForm({
			calendars: twoCalendars,
			familyMembers: [],
			defaultCalendarId: 'deleted-calendar'
		});
		expect(form.selectedCalendarId).toBe('personal');
	});

	it('new event falls back to calendars[0] when default is unset', () => {
		const form = createEventForm({
			calendars: twoCalendars,
			familyMembers: [],
			defaultCalendarId: null
		});
		expect(form.selectedCalendarId).toBe('personal');
	});

	it('new event with no calendars yields empty selection', () => {
		const form = createEventForm({
			calendars: [],
			familyMembers: [],
			defaultCalendarId: 'family'
		});
		expect(form.selectedCalendarId).toBe('');
	});

	it('edit mode keeps the event calendar even when a default is set', () => {
		const form = createEventForm({
			calendars: twoCalendars,
			familyMembers: [],
			defaultCalendarId: 'personal',
			initialEvent: {
				id: 'evt1',
				title: 'Existing',
				description: '',
				location: '',
				calendarId: 'family',
				start: '2026-09-07T10:00:00Z',
				allDay: false
			}
		});
		expect(form.selectedCalendarId).toBe('family');
	});

	it('edit mode falls back to calendars[0] when event calendar is missing', () => {
		const form = createEventForm({
			calendars: twoCalendars,
			familyMembers: [],
			defaultCalendarId: 'personal',
			initialEvent: {
				id: 'evt1',
				title: 'Existing',
				description: '',
				location: '',
				calendarId: 'gone',
				start: '2026-09-07T10:00:00Z',
				allDay: false
			}
		});
		expect(form.selectedCalendarId).toBe('personal');
	});
});

describe('shiftEventDates', () => {
	const base: FormEventData = {
		title: 'Dinner',
		start: '2026-09-23T18:00:00.000Z',
		end: '2026-09-23T19:00:00.000Z',
		location: '',
		description: '',
		calendarId: 'cal1',
		allDay: false,
		recurrenceFrequency: null,
		recurrenceInterval: null,
		reminderMinutes: null
	};

	it('shifts extra dates by their offset from the base', () => {
		const out = shiftEventDates(base, ['2026-09-23', '2026-09-30']);
		expect(out).toHaveLength(1);
		// Same instants as base +7d (zone repr varies by machine).
		expect(new Date(out[0].start).getTime()).toBe(new Date('2026-09-30T18:00:00.000Z').getTime());
		expect(new Date(out[0].end!).getTime()).toBe(new Date('2026-09-30T19:00:00.000Z').getTime());
		expect(out[0].title).toBe('Dinner');
	});

	it('returns empty for single dates, missing input, or missing start', () => {
		expect(shiftEventDates(base, ['2026-09-23'])).toEqual([]);
		expect(shiftEventDates(base, undefined)).toEqual([]);
		expect(shiftEventDates({ ...base, start: '' }, ['2026-09-23', '2026-09-30'])).toEqual([]);
	});
});
