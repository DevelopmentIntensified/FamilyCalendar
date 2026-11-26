/**
 * The day's full list: one card per event (the chip carries the title once),
 * a clock that never prints a placeholder place, and the calendar's own colour
 * beside its name.
 *
 * Doc: ../README.md#selection-bulk-edit-and-the-modals
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { DateTime } from 'luxon';
import DayEventsModal from './DayEventsModal.svelte';
import type { CalendarPageCalendar } from '../calendarPage.contract';
import type { CalendarPageDisplayRow, CalendarPageState } from '../calendarPage.state.svelte';

afterEach(cleanup);

const DAY = DateTime.fromISO('2026-11-25', { zone: 'UTC' });
const CALENDARS: CalendarPageCalendar[] = [
	{ id: 'personal', name: 'Personal Calendar', color: '#fa8072', kind: 'personal' }
];

function row(overrides: Partial<CalendarPageDisplayRow> = {}): CalendarPageDisplayRow {
	return {
		id: 'e1',
		masterId: null,
		occurrenceDate: null,
		title: 'Piano',
		description: null,
		location: null,
		date: '2026-11-25',
		start: '2026-11-25T19:00:00.000Z',
		end: null,
		allDay: false,
		calendarId: 'personal',
		ownerId: 'me',
		creatorName: null,
		rsvpStatus: null,
		attendance: null,
		recurrenceFrequency: null,
		isAd: false,
		...overrides
	};
}

function mount(rows: CalendarPageDisplayRow[]) {
	const openEdit = vi.fn();
	const onclose = vi.fn();
	const state = {
		days: new Map([['2026-11-25', { rows, tasks: [] }]]),
		shell: { calendars: CALENDARS },
		zone: 'UTC',
		now: new Date('2026-11-25T12:00:00Z'),
		calendarOf: (id: string | null) => CALENDARS.find((calendar) => calendar.id === id),
		openEdit,
		openTaskDetail: vi.fn()
	} as unknown as CalendarPageState;
	render(DayEventsModal, { props: { state, open: true, day: DAY, onclose } });
	return { openEdit, onclose };
}

describe('DayEventsModal', () => {
	it('renders one row per event and names each event once', () => {
		mount([
			row({ id: 'a', title: 'Piano' }),
			row({ id: 'b', title: 'Soccer' }),
			row({ id: 'c', title: 'Dentist' })
		]);

		const rows = screen.getAllByTestId('day-event-row');
		expect(rows).toHaveLength(3);
		for (const [index, title] of ['Piano', 'Soccer', 'Dentist'].entries()) {
			expect(within(rows[index]).getAllByText(title)).toHaveLength(1);
			expect(screen.getAllByText(title)).toHaveLength(1);
		}
	});

	it('prints the clock without a place when the event has none, never N/A', () => {
		mount([row({ id: 'a', location: null }), row({ id: 'b', title: 'Soccer', location: 'N/A' })]);

		expect(screen.queryByText(/N\/A/)).toBeNull();
		const [first] = screen.getAllByTestId('day-event-row');
		expect(first.textContent).toContain('7:00 PM');
		expect(first.textContent).not.toContain('·');
	});

	it('shows the start - end clock and a real place', () => {
		mount([row({ end: '2026-11-25T20:30:00.000Z', location: 'Studio B' })]);

		const only = screen.getByTestId('day-event-row');
		expect(only.textContent).toContain('7:00 PM - 8:30 PM');
		expect(only.textContent).toContain('· Studio B');
	});

	it('puts the calendar name beside its own colour', () => {
		mount([row()]);

		const dot = screen.getByTestId('day-event-calendar-dot');
		expect(dot.getAttribute('style')).toContain('background-color');
		expect(dot.parentElement?.textContent).toContain('Personal Calendar');
	});

	it('renders an ad once and without a calendar line', () => {
		mount([row({ id: 'ad', title: 'Toy drive', calendarId: null, isAd: true, allDay: true })]);

		expect(screen.getAllByTestId('day-event-row')).toHaveLength(1);
		expect(screen.getAllByText('Toy drive')).toHaveLength(1);
		expect(screen.queryByTestId('day-event-calendar-dot')).toBeNull();
	});

	it('closes the sheet and opens the edit sheet when the row is tapped', () => {
		const { openEdit, onclose } = mount([row({ id: 'a' })]);

		screen.getByRole('button', { name: /Piano/ }).click();

		expect(onclose).toHaveBeenCalledTimes(1);
		expect(openEdit).toHaveBeenCalledWith('a');
	});
});
