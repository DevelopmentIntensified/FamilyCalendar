import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import {
	resolveInitialView,
	shouldSwipeNavigate,
	resolveCalendarLayout,
	isCurrentPeriod,
	VIEW_BREAKPOINT_PX,
	type CalendarLayout,
	type CalendarView
} from './calendarView';

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

/**
 * #104 — the opening view consults the width. The boundary is ONE number and
 * every width below it is the same rule, so the tiers are tested at a
 * representative width each plus both edges of the boundary.
 */
describe('resolveCalendarLayout (#104) — the one named breakpoint rule', () => {
	it('names the boundary', () => {
		// 768px is Tailwind's `md`, so the JS and the CSS can never disagree.
		expect(VIEW_BREAKPOINT_PX).toBe(768);
	});

	it('reads narrow at every phone width, wide from the boundary up', () => {
		const cases: Array<[number, CalendarLayout]> = [
			[320, 'narrow'],
			[375, 'narrow'],
			[414, 'narrow'],
			[430, 'narrow'],
			[767, 'narrow'],
			[768, 'wide'],
			[834, 'wide'],
			[1024, 'wide'],
			[1440, 'wide']
		];
		for (const [width, expected] of cases) {
			expect(resolveCalendarLayout(width), `at ${width}px`).toBe(expected);
		}
	});

	it('treats an unmeasurable width as wide — today\'s behaviour, unchanged', () => {
		// SSR has no window; a 0/NaN reading is a broken measurement, not a
		// phone. Neither is a reason to change what a user sees.
		for (const width of [null, undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(resolveCalendarLayout(width)).toBe('wide');
		}
	});
});

describe('resolveInitialView — the width joins the order (#104, #119)', () => {
	// The order, loudest first:
	//   1. an explicit `?view=` link      (the user said so, right now)
	//   2. the width, when it is narrow   (month is the phone's opening view)
	//   3. the last view they used        (the user said so, last time)
	//   4. the settings default
	//   5. month
	//
	// #104 put the width BELOW the stored view, on the reasoning that a phone
	// is never a reason to overrule a stated preference. #119 supersedes that
	// for the phone case: mark 1.14 asked for the month grid on mobile, and the
	// owner's decision is that month IS the mobile opening view — the last-used
	// view is remembered across devices, so a phone inherits a week or a day
	// grid chosen on a laptop, and the first screen stops being the calendar.
	// A `?view=` link still wins, because a link is a statement about THIS
	// screen, and tapping a day or a week button is one tap away either way.

	it('a link beats the width', () => {
		expect(resolveInitialView('day', 'dayView', null, 320)).toBe('day');
		expect(resolveInitialView('list', 'dayView', null, 375)).toBe('list');
	});

	it('a narrow screen opens on month, whatever was used last (#119)', () => {
		// SAFETY: literals are exactly the CalendarView union members.
		for (const v of ['month', 'week', 'list', 'day'] as CalendarView[]) {
			for (const width of [320, 375, 414, 767]) {
				expect(resolveInitialView(undefined, 'dayView', v, width), `${v} @ ${width}px`).toBe(
					'month'
				);
			}
		}
	});

	it('a stored view still wins from the breakpoint up', () => {
		// The laptop keeps its memory: nothing about this decision touches a
		// wide screen, which is where the stored view is usually set anyway.
		// SAFETY: literals are exactly the CalendarView union members.
		for (const v of ['month', 'week', 'list', 'day'] as CalendarView[]) {
			for (const width of [768, 834, 1024, 1440]) {
				expect(resolveInitialView(undefined, 'dayView', v, width), `${v} @ ${width}px`).toBe(v);
			}
		}
	});

	it('falls to month on a narrow screen and to the setting on a wide one', () => {
		expect(resolveInitialView(undefined, 'dayView', null, 320)).toBe('month');
		expect(resolveInitialView(undefined, 'dayView', null, 375)).toBe('month');
		expect(resolveInitialView(undefined, 'dayView', null, 767)).toBe('month');
		expect(resolveInitialView(undefined, 'dayView', null, 768)).toBe('day');
		expect(resolveInitialView(undefined, 'weekView', null, 1440)).toBe('week');
	});

	it('keeps the shipped day-view default intact off a narrow screen', () => {
		// The schema default is `dayView`; a wide screen must still honour it.
		expect(resolveInitialView(undefined, 'dayView', null, 1024)).toBe('day');
		// An unknown width (SSR) behaves exactly as it does today.
		expect(resolveInitialView(undefined, 'dayView', null, null)).toBe('day');
	});

	it('an unusable stored view is not a preference — the width still speaks', () => {
		expect(resolveInitialView(undefined, 'dayView', 'bogus-saved', 320)).toBe('month');
		expect(resolveInitialView(undefined, 'dayView', 'bogus-saved', 1440)).toBe('day');
	});

	it('an unknown width is not a narrow screen — no behaviour change at all', () => {
		expect(resolveInitialView(undefined, 'dayView', null, null)).toBe('day');
		expect(resolveInitialView(undefined, 'weekView', null, null)).toBe('week');
		expect(resolveInitialView(undefined, 'bogus-setting', null, null)).toBe('month');
	});
});

/**
 * #119 — the shared DayNav can say "you are already on today" (`aria-current`
 * + a muted Today). That needs one question answered per view: is the period on
 * screen the current one? It lives beside the other view vocabulary because
 * "which period am I looking at" is a view question, and a second definition of
 * it in the toolbar is how two controls drift.
 */
describe('isCurrentPeriod (#119)', () => {
	const now = DateTime.fromISO('2026-09-30T14:00:00');

	it('compares at the granularity of the view, not the day', () => {
		expect(isCurrentPeriod('month', DateTime.fromISO('2026-09-01T00:00:00'), now)).toBe(true);
		expect(isCurrentPeriod('month', DateTime.fromISO('2026-10-01T00:00:00'), now)).toBe(false);
		// the same day is "current" in a week and in a day view
		expect(isCurrentPeriod('week', DateTime.fromISO('2026-09-28T00:00:00'), now)).toBe(true);
		expect(isCurrentPeriod('week', DateTime.fromISO('2026-10-05T00:00:00'), now)).toBe(false);
		expect(isCurrentPeriod('day', DateTime.fromISO('2026-09-30T23:30:00'), now)).toBe(true);
		expect(isCurrentPeriod('day', DateTime.fromISO('2026-09-29T23:30:00'), now)).toBe(false);
	});

	it('treats the list view as one day, because that is what it draws', () => {
		expect(isCurrentPeriod('list', DateTime.fromISO('2026-09-30T08:00:00'), now)).toBe(true);
		expect(isCurrentPeriod('list', DateTime.fromISO('2026-09-29T08:00:00'), now)).toBe(false);
	});

	it('ignores the time of day, because a period is not an instant', () => {
		// SAFETY: literals are exactly the CalendarView union members.
		for (const v of ['month', 'week', 'day', 'list'] as CalendarView[]) {
			expect(isCurrentPeriod(v, DateTime.fromISO('2026-09-30T00:00:01'), now), v).toBe(true);
			expect(isCurrentPeriod(v, DateTime.fromISO('2026-09-30T23:59:59'), now), v).toBe(true);
		}
	});

	it('crosses a year boundary on the calendar, not on the week-number', () => {
		const nye = DateTime.fromISO('2026-12-31T09:00:00');
		expect(isCurrentPeriod('month', DateTime.fromISO('2027-01-01T00:00:00'), nye)).toBe(false);
		expect(isCurrentPeriod('month', DateTime.fromISO('2026-12-01T00:00:00'), nye)).toBe(true);
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
