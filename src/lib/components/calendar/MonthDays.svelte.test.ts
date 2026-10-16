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
 * That defect's fix was a media query; #145 replaces the whole question. The
 * owner ruled (2026-10-04) that a day tap opens the day action sheet at EVERY
 * width — there is no breakpoint left for the tap to disagree about, so the
 * regression test now asserts ONE behaviour under BOTH answers matchMedia can
 * give, instead of two consistent ones.
 */
describe('MonthDays: a day tap opens the sheet at every width (#145)', () => {
	// jsdom has no layout, so the width is simulated by what matchMedia answers.
	// Both answers must produce the same tap result — that IS the one behaviour.
	function stubMatchMedia(matches: boolean) {
		const real = window.matchMedia;
		window.matchMedia = ((q: string) => ({
			matches,
			media: q,
			onchange: null,
			addEventListener: () => {},
			removeEventListener: () => {},
			addListener: () => {},
			removeListener: () => {},
			dispatchEvent: () => false
		})) as unknown as typeof window.matchMedia;
		return () => {
			window.matchMedia = real;
		};
	}

	it.each([true, false])(
		'opens the day action sheet on tap, whether the media query %s',
		async (matches) => {
			const restore = stubMatchMedia(matches);
			try {
				renderJanuaryWithFourEvents();
				await fireEvent.click(screen.getByRole('button', { name: 'Open 01-15-2024' }));
				expect(await screen.findByRole('dialog', { name: 'Day actions' })).toBeTruthy();
			} finally {
				restore();
			}
		}
	);
});
