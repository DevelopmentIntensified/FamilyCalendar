import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { DateTime } from 'luxon';
import MonthDays from './MonthDays.svelte';
import type { Event } from '$lib/types';
import { VIEW_BREAKPOINT_PX, smallScreenQuery } from './calendarView';

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
		recurrenceByDay: null,
		recurrenceCount: null,
		recurrenceUntil: null,
		reminderMinutes: null,
		created_at: new Date(),
		date: new Date(2024, 0, 15)
	};
}

function renderJanuaryWithFourEvents() {
	return render(MonthDays, {
		props: {
			currentDate: DateTime.local(2024, 1, 1),
			events: [
				makeEvent('e1', 'Alpha'),
				makeEvent('e2', 'Beta'),
				makeEvent('e3', 'Gamma'),
				makeEvent('e4', 'Delta')
			],
			days: [15],
			calendars: []
		}
	});
}

describe('MonthDays overflow ("+N more")', () => {
	it('opens the day events modal, and reopens it after closing', async () => {
		renderJanuaryWithFourEvents();

		await fireEvent.click(screen.getByRole('button', { name: '+1 more' }));
		expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent(
			'Monday, January 15, 2024'
		);

		// Close via the modal X, then open again — the modal must come back
		// (regression: internal close desynced parent state so it never reopened).
		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		await waitFor(() => expect(screen.queryByRole('heading', { level: 2 })).toBeNull());

		await fireEvent.click(screen.getByRole('button', { name: '+1 more' }));
		expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent(
			'Monday, January 15, 2024'
		);
	});
});

/**
 * #119 mark 1.14 — "the circle is really big on tablet view", and the day cell's
 * own per-cell tools appearing while the day-action sheet was also live.
 *
 * Both are one root: two different width numbers for one question. The app has
 * ONE breakpoint — `VIEW_BREAKPOINT_PX`, 768, Tailwind's `md` — and the media
 * query that flips a phone into day-action-sheet mode is DERIVED from it, so a
 * cell can never disagree with its own tap handler.
 */
describe('MonthDays owns one breakpoint (#119)', () => {
	it('derives the day-action-sheet media query from the app breakpoint', () => {
		// One below the breakpoint, so it is the exact complement of `md:`.
		expect(smallScreenQuery()).toBe(`(max-width: ${VIEW_BREAKPOINT_PX - 1}px)`);
		expect(smallScreenQuery()).toBe('(max-width: 767px)');
	});

	it('follows the media query, and opens the sheet when it matches', async () => {
		const asked: string[] = [];
		const real = window.matchMedia;
		const matches = (q: string) => {
			asked.push(q);
			return {
				matches: q === smallScreenQuery(),
				media: q,
				onchange: null,
				addEventListener: () => {},
				removeEventListener: () => {},
				addListener: () => {},
				removeListener: () => {},
				dispatchEvent: () => false
			};
		};
		window.matchMedia = matches;
		try {
			renderJanuaryWithFourEvents();
			expect(asked).toContain(smallScreenQuery());
			// In sheet mode a cell tap opens the sheet, not the day view.
			await fireEvent.click(screen.getByRole('button', { name: 'Open 01-15-2024' }));
			expect(await screen.findByRole('dialog', { name: 'Day actions' })).toBeTruthy();
		} finally {
			window.matchMedia = real;
		}
	});
});
