import { describe, it, expect, afterEach, vi } from 'vitest';
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
 * #205 — supersedes #145's 2026-10-04 "every width" ruling. The day tap now
 * forks on width + Selection mode, COMBINED: below the floor (VIEW_BREAKPOINT_PX,
 * #128's md = 768) the mobile sheet owns the tap; above it a desktop tap opens
 * the Day View. Selection mode suppresses the sheet at EVERY width (touch
 * included, so mobile users keep the selection tool) — the tap routes to the
 * desktop answer instead.
 */
describe('MonthDays: day tap forks on width + Selection mode (#205)', () => {
	// jsdom has no layout, so the width is simulated by what matchMedia answers.
	function stubMatchMedia(minWidthMatches: boolean) {
		const real = window.matchMedia;
		window.matchMedia = ((q: string) => ({
			matches: minWidthMatches,
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

	function renderJanuaryWithOpenDay(extra: Record<string, unknown> = {}) {
		const openDay = vi.fn();
		render(MonthDays, {
			props: {
				currentDate: DateTime.local(2024, 1, 1),
				events: [
					makeEvent('e1', 'Alpha'),
					makeEvent('e2', 'Beta'),
					makeEvent('e3', 'Gamma'),
					makeEvent('e4', 'Delta')
				],
				days: [15],
				calendars: [],
				openDay,
				...extra
			}
		});
		return openDay;
	}

	it('below the floor the mobile sheet owns the tap (openDay untouched)', async () => {
		const restore = stubMatchMedia(false);
		try {
			const openDay = renderJanuaryWithOpenDay();
			await fireEvent.click(screen.getByRole('button', { name: 'Open 01-15-2024' }));
			expect(await screen.findByRole('dialog', { name: 'Day actions' })).toBeTruthy();
			expect(openDay).not.toHaveBeenCalled();
		} finally {
			restore();
		}
	});

	it('above the floor a desktop tap opens Day View and never the sheet', async () => {
		const restore = stubMatchMedia(true);
		try {
			const openDay = renderJanuaryWithOpenDay();
			await fireEvent.click(screen.getByRole('button', { name: 'Open 01-15-2024' }));
			expect(openDay).toHaveBeenCalledOnce();
			expect(openDay.mock.calls[0][0].toISODate()).toBe('2024-01-15');
			expect(screen.queryByRole('dialog', { name: 'Day actions' })).toBeNull();
		} finally {
			restore();
		}
	});

	it.each([false, true])(
		'Selection mode suppresses the sheet at matchMedia(min-width:768px)=%s — tap routes to Day View',
		async (minWidthMatches) => {
			const restore = stubMatchMedia(minWidthMatches);
			try {
				const openDay = renderJanuaryWithOpenDay({ selectionMode: true });
				await fireEvent.click(screen.getByRole('button', { name: 'Open 01-15-2024' }));
				expect(openDay).toHaveBeenCalledOnce();
				expect(openDay.mock.calls[0][0].toISODate()).toBe('2024-01-15');
				expect(screen.queryByRole('dialog', { name: 'Day actions' })).toBeNull();
			} finally {
				restore();
			}
		}
	);
});
