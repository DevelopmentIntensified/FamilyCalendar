/**
 * The fridge sheet as the e2e catalog sees it (`ready: 'h1'`): the month title,
 * the weekday header row in the settings' week order, the family/personal line,
 * a cell's item with its clock time, and the "Jump to now" way back when the
 * month is not the current one.
 *
 * Doc: ../../README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import type { CalendarPrintMonth } from '../calendar.calendars.service.server';
import CalendarPrintScreen from './CalendarPrintScreen.svelte';

afterEach(cleanup);

const data: CalendarPrintMonth = {
	year: 2026,
	month: 1,
	monthName: 'January',
	weekStart: 'monday',
	familyName: 'Riveras',
	grid: [
		{ day: 29, iso: '2025-12-29', inMonth: false, isToday: false, items: [] },
		{ day: 30, iso: '2025-12-30', inMonth: false, isToday: false, items: [] },
		{ day: 31, iso: '2025-12-31', inMonth: false, isToday: false, items: [] },
		{ day: 1, iso: '2026-01-01', inMonth: true, isToday: false, items: [] },
		{ day: 2, iso: '2026-01-02', inMonth: true, isToday: false, items: [] },
		{
			day: 3,
			iso: '2026-01-03',
			inMonth: true,
			isToday: false,
			items: [
				{ title: 'Swim class', color: '#fa8072', allDay: false, time: '9a' },
				{ title: 'Family dinner', color: '#e0ffff', allDay: true, time: null }
			]
		},
		{ day: 4, iso: '2026-01-04', inMonth: true, isToday: false, items: [] }
	],
	prev: { year: 2025, month: 12 },
	next: { year: 2026, month: 2 },
	isCurrentMonth: false
};

describe('CalendarPrintScreen', () => {
	it('draws the month, the monday-first week header and each item with its time', () => {
		render(CalendarPrintScreen, { data });

		expect(screen.getByRole('heading', { level: 1 }).textContent?.replace(/\s+/g, ' ').trim()).toBe(
			'January 2026'
		);
		// A Monday-first sheet: the first weekday label is Mon, the last Sun.
		const labels = screen.getAllByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);
		expect(labels.map((label) => label.textContent)).toEqual([
			'Mon',
			'Tue',
			'Wed',
			'Thu',
			'Fri',
			'Sat',
			'Sun'
		]);
		expect(screen.getByText('Riveras · Personal')).toBeTruthy();
		expect(screen.getByText('Swim class')).toBeTruthy();
		expect(screen.getByText('9a')).toBeTruthy();
		// All-day items are timeless, so only one item carries a clock.
		expect(screen.getByText('Family dinner')).toBeTruthy();
	});

	it('offers the way back to the current month only when this is not it', () => {
		render(CalendarPrintScreen, { data });
		expect(screen.getByText('Jump to now ↓').closest('a')?.getAttribute('href')).toBe(
			'/calendar/print'
		);
	});
});
