import { describe, it, expect } from 'vitest';
import { resolveInitialView, type CalendarView } from './calendarView';

describe('resolveInitialView', () => {
	it('prefers an explicit valid initialView', () => {
		expect(resolveInitialView('week', 'monthView', null)).toBe('week');
		expect(resolveInitialView('day', 'monthView', 'month')).toBe('day');
	});

	it('restores the last-used view from storage when no initialView', () => {
		expect(resolveInitialView(undefined, 'monthView', 'list')).toBe('list');
		expect(resolveInitialView('bogus', 'weekView', 'month')).toBe('month');
	});

	it('falls back to the settings default, then month', () => {
		expect(resolveInitialView(undefined, 'weekView', null)).toBe('week');
		expect(resolveInitialView(undefined, 'bogus-setting', null)).toBe('month');
		expect(resolveInitialView(undefined, 'bogus-setting', 'bogus-saved')).toBe('month');
	});

	it('round-trips every view name', () => {
		// SAFETY: literals are exactly the CalendarView union members.
		for (const v of ['month', 'week', 'list', 'day'] as CalendarView[]) {
			expect(resolveInitialView(undefined, 'monthView', v)).toBe(v);
		}
	});
});
