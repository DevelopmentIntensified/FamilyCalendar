import { render, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import { writable } from 'svelte/store';
import { DateTime } from 'luxon';
import MonthView from './MonthView.svelte';

// #222: the grid must end on the last week-row that contains this month —
// no full extra row of next month when next month starts on the week start.
describe('MonthView grid rows (#222)', () => {
	afterEach(cleanup);

	it.each([
		// [month, pref, expected cell count]
		['2026-05', 'monday', 35], // May 1 Fri; Jun 1 is a Monday -> 0 trailing
		['2026-05', 'sunday', 42], // 5 leading + 31 + 6 trailing
		['2026-08', 'monday', 42], // Aug 1 Sat: 5 leading + 31 + 6 trailing (Sep 1 Tue)
		['2026-02', 'sunday', 28], // Feb 1 Sun, Mar 1 Sun -> no padding
		['2026-11', 'sunday', 35], // Nov 1 Sun; Dec 1 Tue -> 4 trailing
		['2026-06', 'monday', 35] // Jun 1 Mon; 30 days; Jul 1 Wed -> 5 trailing
	])('%s with %s-first renders %i cells (whole weeks only)', (ym, pref, cells) => {
		render(MonthView, {
			props: {
				currentDate: writable(DateTime.fromISO(`${ym}-15T12:00:00`)),
				events: [],
				preferedFirstDayOfWeek: pref
			}
		});
		const count = screen.getAllByTestId('month-day-cell').length;
		expect(count).toBe(cells);
		expect(count % 7).toBe(0);
	});
});
