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
