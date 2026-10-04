import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DateTime } from 'luxon';
import EventRecurrenceCard, { describeSeries } from './EventRecurrenceCard.svelte';
import type { Event } from '$lib/types';

afterEach(cleanup);

/** The series fields `describeSeries` reads; every one spelled out. */
function recurring(over: Partial<Event> = {}): Event {
	// SAFETY: this literal is an `Event` with the fields the card reads. The
	// omitted ones (`recurrenceByDay`, `recurrenceCount`, `recurrenceUntil`)
	// are nullable on the schema type and absent from display events alike,
	// and no assertion under test reads them.
	return {
		id: 'evt1',
		calendarId: 'cal1',
		ownerId: 'user1',
		title: 'Piano — Eli',
		start: '2026-02-03T17:30:00Z',
		end: '2026-02-03T18:30:00Z',
		description: null,
		location: 'Lesson Room 2',
		allDay: false,
		recurrenceFrequency: 'weekly',
		recurrenceInterval: 1,
		reminderMinutes: null,
		created_at: new Date('2026-02-01T00:00:00Z'),
		...over
	} as Event;
}

/** A fixed "now", so the occurrence count is a fact and not a weather report. */
const NOW = DateTime.fromISO('2026-09-30T12:00:00Z', { zone: 'utc' });

describe('describeSeries', () => {
	// `event.html` draws "Every Tuesday, 8:00 PM" and "18 occurrences since Feb".
	// The rule is what the grid will repeat; the count is how far it has got.
	it('counts the occurrences of a weekly series since it began', () => {
		const series = describeSeries(recurring(), NOW);

		expect(series?.count).toBe(35); // Tuesdays 3 Feb → 29 Sep, inclusive
		expect(series?.since).toBe('35 occurrences since Feb 2026');
	});

	it('counts by the interval, so a fortnightly series is not double counted', () => {
		const series = describeSeries(recurring({ recurrenceInterval: 2 }), NOW);

		expect(series?.count).toBe(18);
		expect(series?.rule).toBe('Every 2 weeks on Tuesdays');
	});

	it('counts a daily series in days and a monthly one in months', () => {
		expect(
			describeSeries(
				recurring({ recurrenceFrequency: 'daily', recurrenceInterval: null }),
				NOW
			)?.count
		).toBe(239);
		expect(
			describeSeries(
				recurring({ recurrenceFrequency: 'monthly', recurrenceInterval: null }),
				NOW
			)?.count
		).toBe(8);
		expect(
			describeSeries(
				recurring({ recurrenceFrequency: 'yearly', recurrenceInterval: null }),
				NOW
			)?.count
		).toBe(1);
	});

	it('says nothing about an event that does not repeat', () => {
		expect(describeSeries(recurring({ recurrenceFrequency: null }), NOW)).toBeNull();
	});

	it('counts a frequency the vocabulary has never heard of as nothing to say', () => {
		expect(describeSeries(recurring({ recurrenceFrequency: 'fortnightly' }), NOW)).toBeNull();
	});

	it('has not happened yet when the series starts in the future', () => {
		const series = describeSeries(recurring({ start: '2026-12-01T17:30:00Z' }), NOW);

		expect(series?.count).toBe(0);
		expect(series?.since).toBe('Starts Dec 1, 2026');
	});
});

describe('the recurrence card', () => {
	it('says this is a repeating event, and what the rule is', () => {
		render(EventRecurrenceCard, { props: { event: recurring() } });

		expect(screen.getByText('This is a repeating event')).toBeInTheDocument();
		expect(screen.getByText('Every week on Tuesdays')).toBeInTheDocument();
		expect(screen.getByTestId('series-count')).toHaveTextContent(
			'35 occurrences since Feb 2026'
		);
	});

	it('states the mechanism, so the archive showing a cancelled week is not a bug', () => {
		render(EventRecurrenceCard, { props: { event: recurring() } });

		expect(screen.getByText(/eventExceptions/)).toBeInTheDocument();
		expect(screen.getByText(/is_cancelled/)).toBeInTheDocument();
	});

	it('offers both scopes, and says which one was chosen', async () => {
		const onScope = vi.fn();
		render(EventRecurrenceCard, { props: { event: recurring(), deleteScope: 'this', onScope } });

		const thisOccurrence = screen.getByRole('button', { name: 'This occurrence' });
		const allOccurrences = screen.getByRole('button', { name: 'All occurrences' });
		expect(thisOccurrence).toHaveAttribute('aria-pressed', 'true');
		expect(allOccurrences).toHaveAttribute('aria-pressed', 'false');

		await fireEvent.click(allOccurrences);
		expect(onScope).toHaveBeenCalledWith('all');
		await fireEvent.click(thisOccurrence);
		expect(onScope).toHaveBeenCalledWith('this');
	});

	it('draws no scope buttons when the caller wires no action', () => {
		render(EventRecurrenceCard, { props: { event: recurring() } });

		expect(screen.queryByRole('button', { name: 'This occurrence' })).not.toBeInTheDocument();
	});

	it('says the series has not started rather than claiming zero occurrences', () => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW.toJSDate());
		try {
			render(EventRecurrenceCard, {
				props: { event: recurring({ start: '2026-12-01T17:30:00Z' }) }
			});

			expect(screen.getByTestId('series-count')).toHaveTextContent('Starts Dec 1, 2026');
		} finally {
			vi.useRealTimers();
		}
	});
});