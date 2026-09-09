import { render, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import EventDetailList from './EventDetailList.svelte';

const event = {
	id: 'e1',
	title: 'Dinner',
	start: '2026-09-10T18:00:00',
	end: '2026-09-10T19:00:00',
	allDay: false,
	location: 'Home',
	description: 'Bring pie',
	reminderMinutes: 30,
	creatorName: 'Ana',
	isAd: false,
	masterId: null,
	recurrenceFrequency: null,
	recurrenceInterval: null,
	recurrenceByDay: null,
	recurrenceCount: null,
	recurrenceUntil: null,
	date: new Date('2026-09-10T18:00:00')
};

describe('EventDetailList', () => {
	afterEach(cleanup);

	it('renders date, calendar, creator, location, reminder, description, export links', () => {
		render(EventDetailList, { props: { event, calendarName: 'Mine' } });
		expect(screen.getByText(/September 10, 2026/)).toBeTruthy();
		expect(screen.getByText('Mine')).toBeTruthy();
		expect(screen.getByText('Created by Ana')).toBeTruthy();
		expect(screen.getByText('Home')).toBeTruthy();
		expect(screen.getByText('Reminder: 30 minutes before')).toBeTruthy();
		expect(screen.getByText('Bring pie')).toBeTruthy();
		expect(screen.getByText('Add to Google')).toBeTruthy();
		expect(screen.getByText('Add to .ics')).toBeTruthy();
	});

	it('hides ads from export and empty fields entirely', () => {
		render(EventDetailList, {
			props: {
				event: { ...event, isAd: true, location: null, description: null },
				calendarName: null
			}
		});
		expect(screen.queryByText('Add to Google')).toBeNull();
		expect(screen.queryByText('Home')).toBeNull();
	});
});
