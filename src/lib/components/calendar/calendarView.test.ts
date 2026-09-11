import { describe, it, expect } from 'vitest';
import { resolveInitialView, shouldSwipeNavigate, type CalendarView } from './calendarView';

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

describe('shouldSwipeNavigate (#048)', () => {
	it('navigates on month-view horizontal flings', () => {
		expect(shouldSwipeNavigate('month', -80, 10)).toBe(true);
		expect(shouldSwipeNavigate('month', 80, -10)).toBe(true);
	});

	it('ignores taps and vertical scrolls on month view', () => {
		expect(shouldSwipeNavigate('month', 30, 5)).toBe(false);
		expect(shouldSwipeNavigate('month', -80, 70)).toBe(false);
		expect(shouldSwipeNavigate('month', 0, 0)).toBe(false);
	});

	it('never navigates off month view (week/day pan, list scrolls)', () => {
		// SAFETY: literals are exactly the non-month CalendarView members.
		for (const v of ['week', 'list', 'day'] as CalendarView[]) {
			expect(shouldSwipeNavigate(v, -200, 0)).toBe(false);
			expect(shouldSwipeNavigate(v, 200, 0)).toBe(false);
		}
	});
});
