import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writable, get } from 'svelte/store';
import { DateTime } from 'luxon';
import { tick } from 'svelte';
import { toasts } from '$lib/client/toasts';
import Calendar from './Calendar.svelte';
import type { Event } from '$lib/types';

// #069 — the grid could not filter by calendar: colour always meant "this
// event's calendar" with no way to act on it. These pin the behaviour end to
// end — the state, the persistence and the empty state — through the component
// every view hangs off.

// SAFETY: fixture covers the Event fields the views read.
function evt(over: Partial<Event> & { id: string; title: string; calendarId: string }): Event {
	return {
		ownerId: 'u1',
		date: '2026-09-08',
		start: '2026-09-08T10:00:00',
		end: '2026-09-08T11:00:00',
		description: null,
		location: null,
		allDay: false,
		recurrenceFrequency: null,
		recurrenceInterval: null,
		recurrenceByDay: null,
		recurrenceCount: null,
		recurrenceUntil: null,
		reminderMinutes: null,
		created_at: new Date('2026-01-01T00:00:00Z'),
		...over
	} as Event;
}

const PERSONAL = { id: 'cal-personal', name: 'Personal Calendar', color: '#fa8072' };
const FAMILY = { id: 'cal-family', name: 'Smith Family', color: '#e0ffff' };

const standup = evt({ id: 'e1', title: 'Standup', calendarId: 'cal-personal' });
const rehearsal = evt({ id: 'e2', title: 'Rehearsal', calendarId: 'cal-family' });
// Sponsored events sit on no calendar row (`calendarId: ''`).
const ad = evt({ id: 'e3', title: 'Toy drive', calendarId: '', allDay: true });

const dueTasks = [
	{ id: 't1', title: 'Sign form', dueDate: new Date('2026-09-08T09:00:00'), calendarId: 'cal-personal' },
	{ id: 't2', title: 'Book sitter', dueDate: new Date('2026-09-08T09:00:00'), calendarId: 'cal-family' }
];

function setup(over: Record<string, unknown> = {}) {
	const props = {
		currentDate: writable(DateTime.fromISO('2026-09-08T12:00:00')),
		events: [standup, rehearsal, ad],
		removeEvent: vi.fn(),
		calendarIds: [PERSONAL, FAMILY],
		filterUserId: 'u1',
		dueTasks,
		...over
	};
	render(Calendar, { props });
	return props;
}

/** The filter trigger, opened. */
async function openFilter() {
	await fireEvent.click(screen.getByTestId('calendar-filter-trigger'));
}

describe('Calendar — per-calendar view filter (#069)', () => {
	beforeEach(() => {
		window.localStorage.clear();
		toasts.set([]);
	});
	afterEach(() => {
		window.localStorage.clear();
		toasts.set([]);
		cleanup();
	});

	it('shows every calendar when nothing is hidden', () => {
		setup();
		expect(screen.getByText('Standup')).toBeInTheDocument();
		expect(screen.getByText('Rehearsal')).toBeInTheDocument();
	});

	it('removes the hidden calendar’s events and its due tasks from the view', async () => {
		setup();
		await openFilter();
		await fireEvent.click(screen.getByRole('switch', { name: 'Hide Smith Family' }));
		await tick();
		expect(screen.queryByText('Rehearsal')).toBeNull();
		expect(screen.queryByText('Book sitter')).toBeNull();
		// Everything else stays, including the ad, which is on no calendar.
		expect(screen.getByText('Standup')).toBeInTheDocument();
		expect(screen.getByText('Sign form')).toBeInTheDocument();
		expect(screen.getByText('Toy drive')).toBeInTheDocument();
	});

	it('filters every view, not just the one on screen', async () => {
		const p = setup();
		await openFilter();
		await fireEvent.click(screen.getByRole('switch', { name: 'Hide Smith Family' }));
		await tick();
		// Month is the default view; walk the views and assert each one is clean.
		for (const view of ['Week', 'List']) {
			await fireEvent.click(screen.getByText(view));
			await tick();
			expect(screen.queryByText('Rehearsal')).toBeNull();
			expect(screen.getByText('Standup')).toBeInTheDocument();
		}
		// Day view is reached from a day cell; drive it through the store.
		p.currentDate.set(DateTime.fromISO('2026-09-08T12:00:00'));
		expect(screen.queryByText('Rehearsal')).toBeNull();
	});

	it('survives a reload', async () => {
		setup();
		await openFilter();
		await fireEvent.click(screen.getByRole('switch', { name: 'Hide Smith Family' }));
		await tick();
		expect(JSON.parse(window.localStorage.getItem('familyplanz:hiddenCalendars:u1') ?? '[]')).toEqual(
			['cal-family']
		);
		// A fresh mount is what a reload looks like.
		cleanup();
		setup();
		expect(screen.queryByText('Rehearsal')).toBeNull();
		expect(screen.getByText('Standup')).toBeInTheDocument();
	});

	it('keeps two users’ filters apart on one device', async () => {
		setup();
		await openFilter();
		await fireEvent.click(screen.getByRole('switch', { name: 'Hide Smith Family' }));
		await tick();
		cleanup();
		setup({ filterUserId: 'u2' });
		// A different user on the same device starts from nothing hidden.
		expect(screen.getByText('Rehearsal')).toBeInTheDocument();
	});

	it('hides everything in one tap and brings it back in one tap', async () => {
		setup({ events: [standup, rehearsal] });
		await openFilter();
		await fireEvent.click(screen.getByTestId('calendar-filter-all'));
		await tick();
		// A real empty state, not a blank grid: it names what is off and offers
		// the way back.
		const empty = screen.getByTestId('calendar-filter-empty');
		expect(empty).toHaveTextContent('Every calendar is hidden');
		expect(empty).toHaveTextContent('Smith Family');
		expect(empty).toHaveTextContent('Personal Calendar');
		expect(screen.queryByText('Standup')).toBeNull();
		expect(screen.queryByText('Rehearsal')).toBeNull();

		await fireEvent.click(screen.getByTestId('calendar-filter-show-all'));
		await tick();
		expect(screen.queryByTestId('calendar-filter-empty')).toBeNull();
		expect(screen.getByText('Rehearsal')).toBeInTheDocument();
		expect(screen.getByText('Standup')).toBeInTheDocument();
	});

	it('keeps the grid when a sponsored event is all that is left', async () => {
		// An ad is on no calendar, so it survives hide-all. The grid is not
		// blank, and claiming it is would be a lie.
		setup({ events: [ad] });
		await openFilter();
		await fireEvent.click(screen.getByTestId('calendar-filter-all'));
		await tick();
		expect(screen.queryByTestId('calendar-filter-empty')).toBeNull();
		expect(screen.getByText('Toy drive')).toBeInTheDocument();
	});

	it('does not claim an empty week is a filter when nothing is hidden', () => {
		// The empty state belongs to the filter, not to an empty period.
		setup({ events: [], dueTasks: [] });
		expect(screen.queryByTestId('calendar-filter-empty')).toBeNull();
	});

	it('never hides an ad, which belongs to no calendar', async () => {
		setup();
		await openFilter();
		await fireEvent.click(screen.getByRole('switch', { name: 'Hide Personal Calendar' }));
		await tick();
		expect(screen.getByText('Toy drive')).toBeInTheDocument();
	});

	it('acknowledges every toggle with a toast naming what changed', async () => {
		setup();
		await openFilter();
		await fireEvent.click(screen.getByRole('switch', { name: 'Hide Smith Family' }));
		await tick();
		let list = get(toasts);
		expect(list.at(-1)?.message).toMatch(/Hidden Smith Family/);
		await fireEvent.click(screen.getByRole('switch', { name: 'Show Smith Family' }));
		await tick();
		list = get(toasts);
		expect(list.at(-1)?.message).toMatch(/Showing Smith Family/);
	});

	it('leaves the default-calendar setting alone', async () => {
		// The default calendar is a creation target read by the create form
		// (`defaultCalendarId`); the filter is a reading preference stored
		// under its own key. Toggling must not touch the former.
		const p = setup();
		await openFilter();
		await fireEvent.click(screen.getByRole('switch', { name: 'Hide Personal Calendar' }));
		await tick();
		expect(window.localStorage.getItem('familyplanz:hiddenCalendars:u1')).toBe(
			'["cal-personal"]'
		);
		expect(Object.keys(window.localStorage)).toEqual(['familyplanz:hiddenCalendars:u1']);
		expect(p.events.map((e) => e.calendarId)).toContain('cal-personal');
	});

	it('degrades to showing everything when storage holds junk', () => {
		window.localStorage.setItem('familyplanz:hiddenCalendars:u1', '{oops');
		setup();
		expect(screen.getByText('Standup')).toBeInTheDocument();
		expect(screen.getByText('Rehearsal')).toBeInTheDocument();
	});
});
