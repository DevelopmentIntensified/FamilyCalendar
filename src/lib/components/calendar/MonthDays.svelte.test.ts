import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { DateTime } from 'luxon';
import MonthDays from './MonthDays.svelte';
import type { Event } from '$lib/types';

afterEach(() => {
	cleanup();
});

function makeEvent(id: string, title: string): Event {
	return {
		id,
		calendarId: null,
		ownerId: 'u1',
		title,
		start: '2024-01-15T10:00:00.000Z',
		end: null,
		description: null,
		location: null,
		allDay: false,
		recurrenceFrequency: null,
		recurrenceInterval: null,
		created_at: new Date(),
		date: new Date(2024, 0, 15)
	} as unknown as Event;
}

function renderJanuaryWithFourEvents() {
	return render(MonthDays, {
		props: {
			currentDate: DateTime.local(2024, 1, 1),
			events: [makeEvent('e1', 'Alpha'), makeEvent('e2', 'Beta'), makeEvent('e3', 'Gamma'), makeEvent('e4', 'Delta')],
			days: [15],
			calendars: []
		}
	});
}

describe('MonthDays overflow ("+N more")', () => {
	it('opens the day events modal, and reopens it after closing', async () => {
		renderJanuaryWithFourEvents();

		await fireEvent.click(screen.getByRole('button', { name: '+1 more' }));
		expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent('Monday, January 15, 2024');

		// Close via the modal X, then open again — the modal must come back
		// (regression: internal close desynced parent state so it never reopened).
		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		await waitFor(() => expect(screen.queryByRole('heading', { level: 2 })).toBeNull());

		await fireEvent.click(screen.getByRole('button', { name: '+1 more' }));
		expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent('Monday, January 15, 2024');
	});
});
