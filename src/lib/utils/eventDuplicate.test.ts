import { describe, it, expect } from 'vitest';
import { buildDuplicateEventPayload } from './eventDuplicate';

const event = {
	title: 'Dinner',
	start: '2026-09-10T18:00:00',
	end: '2026-09-10T19:00:00',
	description: 'Pie',
	location: 'Home',
	allDay: false,
	calendarId: 'cal1',
	recurrenceFrequency: null,
	recurrenceInterval: null,
	recurrenceByDay: null,
	recurrenceCount: null,
	recurrenceUntil: null,
	reminderMinutes: 30
};

describe('buildDuplicateEventPayload', () => {
	it('copies scalar fields with a (copy) title', () => {
		const payload = buildDuplicateEventPayload(event, [], []);
		expect(payload.title).toBe('Dinner (copy)');
		expect(payload.calendarId).toBe('cal1');
		expect(payload.reminderMinutes).toBe(30);
		expect(payload.attendees).toEqual([]);
	});

	it('maps members with required/optional types and guests by name', () => {
		const payload = buildDuplicateEventPayload(
			event,
			[
				{ userId: 'u1', inviteType: 'required' },
				{ userId: 'u2', inviteType: 'maybe' }
			],
			['Cousin Jo']
		);
		expect(payload.attendees).toEqual([
			{ value: 'u1', isUser: true, inviteType: 'required' },
			{ value: 'u2', isUser: true, inviteType: 'optional' },
			{ value: 'Cousin Jo', isUser: false, inviteType: 'optional' }
		]);
	});
});
