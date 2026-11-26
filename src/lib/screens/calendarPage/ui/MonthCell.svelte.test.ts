/**
 * The month cell's chip layout (#329): the day number owns its own row and
 * every chip stacks below it at the full cell width, one left edge, long
 * titles truncated.
 *
 * Doc: ../README.md
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { DateTime } from 'luxon';
import type { CalendarPageTaskRow } from '../calendarPage.contract';
import type { CalendarPageDisplayRow, CalendarPageState } from '../calendarPage.state.svelte';
import MonthCell from './MonthCell.svelte';

const DAY = DateTime.fromISO('2026-03-10', { zone: 'UTC' });
const LONG = 'A very long title that cannot possibly fit a month cell';

function row(id: string, title: string): CalendarPageDisplayRow {
	return {
		id,
		masterId: null,
		occurrenceDate: null,
		title,
		description: null,
		location: null,
		date: '2026-03-10',
		start: '2026-03-10T10:00:00.000Z',
		end: null,
		allDay: false,
		calendarId: 'personal',
		ownerId: 'me',
		creatorName: null,
		rsvpStatus: null,
		attendance: null,
		recurrenceFrequency: null,
		isAd: false
	};
}

const task: CalendarPageTaskRow = {
	id: 't1',
	title: 'Water plants',
	dueDate: '2026-03-10T12:00:00.000Z',
	calendarId: null,
	assignedTo: null,
	assigneeFirstName: null,
	assigneeLastName: null,
	recurrenceFrequency: null,
	recurrenceInterval: null
};

function renderCell(rows: CalendarPageDisplayRow[], tasks: CalendarPageTaskRow[] = []) {
	const state = {
		days: new Map([['2026-03-10', { rows, tasks }]]),
		todayKey: '2026-03-01',
		now: new Date('2026-03-10T00:00:00.000Z'),
		selectionMode: false,
		selectedSet: new Set<string>(),
		shell: { calendars: [] }
	} as unknown as CalendarPageState;
	render(MonthCell, { props: { state, day: DAY, inMonth: true, narrow: false } });
}

const chips = () => document.querySelector('[data-testid="month-chips"]')!;
const disc = () => document.querySelector('[data-testid="day-disc"]')!;

afterEach(cleanup);

describe('MonthCell stacked chips (#329)', () => {
	it('puts the day number on its own row, before and outside the chips', () => {
		renderCell([row('e1', 'Piano')]);
		expect(chips().contains(disc())).toBe(false);
		expect(disc().parentElement).toBe(chips().parentElement);
		expect(disc().nextElementSibling).toBe(chips());
		expect(chips().firstElementChild).toBe(screen.getByText('Piano').closest('button'));
	});

	it('stacks chips in a column, never a wrapping row', () => {
		renderCell([row('e1', 'Piano'), row('e2', 'Dentist')]);
		expect(chips().className).toMatch(/\bflex-col\b/);
		expect(chips().className).not.toMatch(/\bflex-wrap\b/);
	});

	it('gives every event chip the full cell width and truncates its title', () => {
		renderCell([row('e1', 'Piano'), row('e2', LONG)]);
		for (const title of ['Piano', LONG]) {
			const label = screen.getByText(title);
			expect(label.className).toMatch(/\btruncate\b/);
			const chip = label.closest('button')!;
			expect(chip.className).toMatch(/(^|\s)w-full\b/);
			expect(chip.className).toMatch(/\boverflow-hidden\b/);
		}
	});

	it('gives a task chip the full cell width and truncates its title too', () => {
		renderCell([], [task]);
		const label = screen.getByText('Water plants');
		expect(label.className).toMatch(/\btruncate\b/);
		expect(label.closest('button')!.className).toMatch(/(^|\s)w-full\b/);
	});
});
