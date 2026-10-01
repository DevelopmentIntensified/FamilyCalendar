import { render, screen, fireEvent, cleanup, within } from '@testing-library/svelte';
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

/**
 * #119 — "when we are in mobile view the calendar disappears, so the calendar
 * is still the main focus and other things are not in the way" (mark 1.1).
 *
 * There is no rail in the shipped calendar, and these are the pins that keep
 * it that way: below the breakpoint the MONTH GRID is the page, and the four
 * cards the prototype's rail carried never appear here at any width. They are
 * cheap to assert and expensive to lose — a rail is a whole column of
 * components, and nothing warns you when one grows back.
 */
describe('Calendar — the grid is the page on mobile (#119)', () => {
	const realWidth = window.innerWidth;

	function atPhoneWidth() {
		Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true, writable: true });
	}

	function atTabletWidth() {
		// #119 mark 1.14: "on tablet view we need the cal view, not the micro cal
		// view". 768 is the app's ONE breakpoint (VIEW_BREAKPOINT_PX), and the
		// width D measured at 400px is the width a portrait tablet is nowhere near.
		Object.defineProperty(window, 'innerWidth', { value: 768, configurable: true, writable: true });
	}

	function atDesktopWidth() {
		Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true, writable: true });
	}

	beforeEach(() => {
		window.localStorage.clear();
		toasts.set([]);
	});
	afterEach(() => {
		window.localStorage.clear();
		toasts.set([]);
		Object.defineProperty(window, 'innerWidth', { value: realWidth, configurable: true, writable: true });
		cleanup();
	});

	it('opens on the month grid at phone width even when a day view was last used', () => {
		// The stored view is remembered ACROSS devices: a week or day grid
		// picked on a laptop used to follow the family onto the phone, and the
		// first screen stopped being the calendar. Month wins below 768px.
		window.localStorage.setItem('familyplanz:lastView', 'day');
		atPhoneWidth();
		setup();
		// The month grid is the only view that draws whole day cells.
		expect(screen.getAllByRole('button', { name: /^Open \d{2}-\d{2}-\d{4}$/ }).length).toBeGreaterThan(
			27
		);
	});

	it('still honours a ?view= link on a phone — the link is about this screen', () => {
		atPhoneWidth();
		setup({ initialView: 'week' });
		// A week grid has no per-day "Open <date>" cells; the link won.
		expect(screen.queryAllByRole('button', { name: /^Open \d{2}-\d{2}-\d{4}$/ })).toHaveLength(0);
	});

	it('carries no rail at any width: no up next, no overdue card, no by person, no mini month', () => {
		// The ticket's line is "gone below 768px, and gone at tablet too", so the
		// loop now includes 768 itself rather than 375 and 1280 and calling it
		// covered. Nothing warns you when a rail grows back — a rail is a whole
		// column of components.
		for (const width of ['phone', 'tablet', 'desktop'] as const) {
			if (width === 'phone') atPhoneWidth();
			else if (width === 'tablet') atTabletWidth();
			else atDesktopWidth();
			setup();
			for (const ghost of [/up next/i, /overdue/i, /by person/i, /whose plans/i]) {
				expect(screen.queryByText(ghost), `${ghost} @ ${width}`).toBeNull();
			}
			cleanup();
			window.localStorage.clear();
		}
	});

	it('is ONE full-width column at every width — no side pane, no mini month beside the grid', () => {
		// Mark 1.14 asked for "the cal view, not the micro cal view" at tablet.
		// The thing that answers it is not a size but a SHAPE: the month grid is
		// the page's only column, so there is nowhere for a second calendar to sit.
		for (const width of ['phone', 'tablet', 'desktop'] as const) {
			if (width === 'phone') atPhoneWidth();
			else if (width === 'tablet') atTabletWidth();
			else atDesktopWidth();
			setup();
			const grid = screen.getByTestId('month-grid');
			// seven days across, and nothing that narrows it into a column
			expect(grid.className, width).toMatch(/\bgrid-cols-7\b/);
			expect(grid.className, width).not.toMatch(/max-w-|lg:grid-cols-|sm:grid-cols-\[|md:grid-cols-\[/);
			cleanup();
			window.localStorage.clear();
		}
	});

	it('draws the real month grid at 768, not a miniature of it', () => {
		// 768 is a WIDE screen for the opening-view rule, so a stored day view is
		// still honoured here (that is #104's contract and 119 kept it). What must
		// never happen is a miniature month: the rail's mini month was 7 cells of
		// one-digit dates, and the real grid is 42 day cells you can open.
		atTabletWidth();
		window.localStorage.setItem('familyplanz:lastView', 'month');
		setup();
		expect(screen.getAllByRole('button', { name: /^Open \d{2}-\d{2}-\d{4}$/ }).length).toBeGreaterThan(
			27
		);
		// and no miniature twin anywhere on the page
		expect(document.querySelectorAll('.mini, [data-testid="mini-month"]')).toHaveLength(0);
	});

	it('draws due tasks in the day cells, not as a card beside the grid', () => {
		// Mark 1.13 called the overdue card a Task surface on a Calendar page.
		// The honest home for a due task here is the day it is due.
		atPhoneWidth();
		setup();
		const task = screen.getByText('Sign form');
		expect(task).toBeInTheDocument();
		// It lives inside a day cell, so it is reachable from the grid itself.
		expect(task.closest('[class*="min-h-"]')).not.toBeNull();
	});
});

/**
 * #120 mark 1.15 — search moved to the second toolbar row, full width, on every
 * screen. The toolbar owns the field; the PAGE owns the filter, exactly as it
 * owns the hidden-calendar list, so the two filters compose in one place and
 * the grid is the last word on what gets drawn.
 */
describe('Calendar — search filters the grid (#120)', () => {
	beforeEach(() => {
		window.localStorage.clear();
		toasts.set([]);
	});
	afterEach(() => {
		window.localStorage.clear();
		toasts.set([]);
		cleanup();
	});

	async function type(query: string) {
		await fireEvent.input(screen.getByRole('searchbox'), { target: { value: query } });
		await tick();
	}

	it('narrows the grid as you type, and says how much is left', async () => {
		setup();
		await type('standup');
		expect(screen.getByText('Standup')).toBeInTheDocument();
		expect(screen.queryByText('Rehearsal')).toBeNull();
		// The ack: what the query kept, and what it kept it out of. Five is three
		// events plus two due tasks — the count is the whole grid, not one of them.
		const status = screen.getByTestId('search-status');
		expect(status).toHaveTextContent('1 of 5');
	});

	it('finds a task as well as an event', async () => {
		setup();
		await type('sitter');
		expect(screen.getByText('Book sitter')).toBeInTheDocument();
		expect(screen.queryByText('Standup')).toBeNull();
	});

	it('says nothing matches instead of showing a blank grid', async () => {
		setup();
		await type('zzzz');
		const empty = screen.getByTestId('search-empty');
		expect(empty).toHaveTextContent('Nothing matches');
		expect(empty).toHaveTextContent('zzzz');
		// …and it is not the calendar-filter empty state, which would be a lie.
		expect(screen.queryByTestId('calendar-filter-empty')).toBeNull();
		// The way back is one tap.
		await fireEvent.click(within(empty).getByRole('button', { name: 'Clear search' }));
		await tick();
		expect(screen.queryByTestId('search-empty')).toBeNull();
		expect(screen.getByText('Standup')).toBeInTheDocument();
	});

	it('leaves the grid alone when the query is cleared', async () => {
		setup();
		await type('standup');
		await type('');
		expect(screen.getByText('Standup')).toBeInTheDocument();
		expect(screen.getByText('Rehearsal')).toBeInTheDocument();
		expect(screen.getByText('Toy drive')).toBeInTheDocument();
		expect(screen.queryByTestId('search-status')).toBeNull();
	});
});

/**
 * #127 mark 1.11 — "by person … should be filter buttons".
 *
 * The rail card was a reading aid; this is a filter, so it has to behave like
 * one. These pin the four things a filter owes the person using it: it filters
 * the whole grid (events AND due tasks), it COMPOSES with the two filters
 * already on this page rather than replacing them, it survives a reload and a
 * `?view=` link without becoming something else, and when it matches nothing it
 * says so in one tap instead of leaving a blank grid that reads as "nothing
 * scheduled".
 */
describe('Calendar — the person filter (#127, mark 1.11)', () => {
	const piano = evt({ id: 'e1', title: 'Piano', calendarId: 'cal-family', ownerId: 'u-sarah' });
	const soccer = evt({ id: 'e2', title: 'Soccer', calendarId: 'cal-family', ownerId: 'u-mia' });
	const people = [
		{
			id: 't1',
			title: 'Bins out',
			dueDate: new Date('2026-09-08T09:00:00'),
			calendarId: 'cal-family',
			assignedTo: 'u-sarah',
			assigneeFirstName: 'Sarah'
		},
		{
			id: 't2',
			title: 'Permission slip',
			dueDate: new Date('2026-09-08T09:00:00'),
			calendarId: 'cal-family',
			assignedTo: 'u-mia',
			assigneeFirstName: 'Mia'
		}
	];

	/** The three things this fixture varies. Named, not an open dictionary:
	 *  an override bag with no contract is how a fixture starts lying. */
	interface PeopleOverrides {
		events?: Event[];
		filterUserId?: string | null;
		initialView?: string;
	}

	function setupPeople(over: PeopleOverrides = {}) {
		const props = {
			currentDate: writable(DateTime.fromISO('2026-09-08T12:00:00')),
			events: [piano, soccer, ad],
			calendarIds: [PERSONAL, FAMILY],
			filterUserId: 'u-sarah',
			dueTasks: people,
			...over
		};
		render(Calendar, { props });
		return props;
	}

	beforeEach(() => {
		window.localStorage.clear();
		toasts.set([]);
	});
	afterEach(() => {
		window.localStorage.clear();
		toasts.set([]);
		cleanup();
	});

	async function openSheet() {
		// The trigger is a toggle, so opening twice would close it.
		if (!screen.queryByTestId('calendar-filter-panel')) {
			await fireEvent.click(screen.getByTestId('calendar-filter-trigger'));
		}
	}

	async function hidePerson(name: string | RegExp) {
		await openSheet();
		await fireEvent.click(screen.getByRole('button', { name }));
		await tick();
	}

	it('lists the people who have something, viewer first, with what each would keep', async () => {
		setupPeople();
		await openSheet();
		// The roster comes from the loaded rows, not a member list: a person with
		// nothing on this calendar has nothing to switch on or off.
		expect(screen.getByRole('button', { name: /^You,/ })).toHaveTextContent('2');
		expect(screen.getByRole('button', { name: /^Mia,/ })).toHaveTextContent('2');
		// …and the viewer is listed first, so the row you want is the row you see.
		const rows = screen.getAllByTestId('assignee-row');
		expect(rows[0]).toHaveAccessibleName(/^You,/);
	});

	it('drops that person\'s events AND their due tasks from the grid', async () => {
		setupPeople();
		await hidePerson(/^Mia,/);
		expect(screen.queryByText('Soccer')).toBeNull();
		expect(screen.queryByText('Permission slip')).toBeNull();
		// Everyone else stays.
		expect(screen.getByText('Piano')).toBeInTheDocument();
		expect(screen.getByText('Bins out')).toBeInTheDocument();
	});

	it('never reaches a sponsored event, which belongs to nobody', async () => {
		// The same rule the calendar filter already states: an ad is on no
		// calendar, so no calendar toggle hides it — and it is on nobody's list
		// either, so no person filter may invent one and hide it.
		setupPeople();
		await hidePerson(/^You,/);
		expect(screen.getByText('Toy drive')).toBeInTheDocument();
	});

	it('composes with the calendar filter instead of replacing it', async () => {
		setupPeople();
		// Both axes on: Sarah's personal-calendar plans and Mia's stay; the
		// family calendar's are gone whichever filter was applied.
		await hidePerson(/^Mia,/);
		await openSheet();
		await fireEvent.click(screen.getByRole('switch', { name: /Smith Family/ }));
		await tick();
		expect(screen.queryByText('Piano')).toBeNull();
		expect(screen.queryByText('Soccer')).toBeNull();
		// The ad is on no calendar and nobody's list: it is still here.
		expect(screen.getByText('Toy drive')).toBeInTheDocument();
		// …and switching Mia back on does not bring the family calendar back.
		await openSheet();
		await fireEvent.click(screen.getByRole('button', { name: /^Mia,/ }));
		await tick();
		expect(screen.getByText('Toy drive')).toBeInTheDocument();
	});

	it('composes with search, and the sheet counts what is actually left', async () => {
		setupPeople();
		await hidePerson(/^Mia,/);
		await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'soccer' } });
		await tick();
		// Mia is off, so her one match is not on the calendar…
		expect(screen.queryByText('Soccer')).toBeNull();
		// …and the sheet says so rather than still claiming she has two.
		await openSheet();
		expect(screen.getByRole('button', { name: /^Mia,/ })).toHaveAccessibleName(/switched off/);
		// The person who IS on has nothing left either, and the row says 0
		// rather than vanishing — a filter whose options disappear is a dead end.
		expect(screen.getByRole('button', { name: /^You,/ })).toHaveTextContent('0');
	});

	it('says so when the filter matches nothing, and clears in one action', async () => {
		// No sponsored event in this fixture: an ad belongs to no calendar and no
		// person, so it would keep the grid alive and this state would be a lie.
		setupPeople({ events: [piano, soccer] });
		await hidePerson(/^Mia,/);
		// Now take away the calendar her plans were on. The grid has nothing to
		// draw, and a blank grid would read as "nothing scheduled".
		await openSheet();
		await fireEvent.click(screen.getByRole('switch', { name: /Smith Family/ }));
		await tick();
		const empty = screen.getByTestId('assignee-empty');
		expect(empty).toHaveTextContent('Mia');
		// The other two empty states would both be a lie here, so neither is used.
		expect(screen.queryByTestId('calendar-filter-empty')).toBeNull();
		expect(screen.queryByTestId('search-empty')).toBeNull();
		await fireEvent.click(within(empty).getByRole('button', { name: 'Show everyone' }));
		await tick();
		expect(screen.queryByTestId('assignee-empty')).toBeNull();
		// The grid is back — an empty month, which is what it honestly is.
		expect(screen.getByTestId('month-grid')).toBeInTheDocument();
	});

	it('survives a reload, and keeps two users\' filters apart on one device', async () => {
		setupPeople();
		await hidePerson(/^Mia,/);
		expect(JSON.parse(window.localStorage.getItem('familyplanz:hiddenAssignees:u-sarah') ?? '[]')).toEqual([
			'u-mia'
		]);
		// A fresh mount is what a reload looks like.
		cleanup();
		setupPeople();
		expect(screen.queryByText('Soccer')).toBeNull();
		expect(screen.getByText('Piano')).toBeInTheDocument();
		cleanup();
		setupPeople({ filterUserId: 'u-someone-else' });
		expect(screen.getByText('Soccer')).toBeInTheDocument();
	});

	it('leaves the ?view= deep link alone: a filtered month view is still a month view', async () => {
		// The filter is a reading preference on its own key. It must not decide
		// what the grid is, and a link that names a view must still win.
		setupPeople({ initialView: 'week' });
		await hidePerson(/^Mia,/);
		// The week grid still draws — no per-day "Open <date>" month cells.
		expect(screen.queryAllByRole('button', { name: /^Open \d{2}-\d{2}-\d{4}$/ })).toHaveLength(0);
		expect(screen.getByText('Piano')).toBeInTheDocument();
		cleanup();
		setupPeople();
		await hidePerson(/^Mia,/);
		expect(screen.getAllByRole('button', { name: /^Open \d{2}-\d{2}-\d{4}$/ }).length).toBeGreaterThan(27);
	});

	it('acknowledges every switch with a toast naming what changed and what is next', async () => {
		setupPeople();
		await hidePerson(/^Mia,/);
		expect(get(toasts).at(-1)?.message).toMatch(/Hidden Mia/);
		await openSheet();
		await fireEvent.click(screen.getByRole('button', { name: /^Mia,/ }));
		await tick();
		expect(get(toasts).at(-1)?.message).toMatch(/Showing Mia/);
	});

	it('writes its own key, beside the calendar one and never on top of it', async () => {
		// #069 pinned that the reading filters leave the default-calendar setting
		// alone; this is the same promise for the second filter.
		setupPeople();
		await hidePerson(/^Mia,/);
		await openSheet();
		await fireEvent.click(screen.getByRole('switch', { name: /Smith Family/ }));
		await tick();
		expect(Object.keys(window.localStorage).sort()).toEqual([
			'familyplanz:hiddenAssignees:u-sarah',
			'familyplanz:hiddenCalendars:u-sarah'
		]);
	});
});
