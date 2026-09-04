import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEventForm } from './EventFormModel.svelte';

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
