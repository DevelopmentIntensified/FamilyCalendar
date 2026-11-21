/**
 * Pure view rules: the opening-view order (link › width › stored › setting ›
 * month), the one width breakpoint, current-period comparison and the swipe
 * gate. Expected values come from the legacy tables in
 * `src/lib/components/calendar/calendarView.test.ts` and the README Invariants,
 * never from running this code.
 *
 * Doc: ./README.md#entry-url-and-the-opening-view
 */
import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import {
	CALENDAR_VIEWS,
	canSwipeNavigate,
	isCalendarCurrentPeriod,
	isCalendarView,
	resolveCalendarInitialView,
	resolveCalendarLayout,
	VIEW_BREAKPOINT_PX,
	viewFromName,
	viewFromSettingKey,
	type CalendarLayout
} from './calendarPage.view.rules';

describe('the view vocabulary', () => {
	it('keeps the four views the toolbar and the URL share', () => {
		expect(CALENDAR_VIEWS).toEqual(['month', 'week', 'list', 'day']);
	});

	it('reads a settings key, and treats an unknown key as no view', () => {
		expect(viewFromSettingKey('monthView')).toBe('month');
		expect(viewFromSettingKey('weekView')).toBe('week');
		expect(viewFromSettingKey('listView')).toBe('list');
		expect(viewFromSettingKey('dayView')).toBe('day');
		expect(viewFromSettingKey('dashboard')).toBeUndefined();
	});

	it('round-trips every view name', () => {
		for (const view of CALENDAR_VIEWS) {
			expect(viewFromName(view), view).toBe(view);
		}
		expect(viewFromName('dashboard')).toBeUndefined();
	});

	it('recognises only the four names, case-sensitively', () => {
		expect(isCalendarView('month')).toBe(true);
		expect(isCalendarView('Month')).toBe(false);
		expect(isCalendarView('')).toBe(false);
		expect(isCalendarView(null)).toBe(false);
		expect(isCalendarView(undefined)).toBe(false);
	});
});

describe('resolveCalendarInitialView', () => {
	it('prefers an explicit valid initialView', () => {
		expect(resolveCalendarInitialView('week', 'monthView', null)).toBe('week');
		expect(resolveCalendarInitialView('day', 'monthView', 'month')).toBe('day');
	});

	it('restores the last-used view from storage when no initialView', () => {
		expect(resolveCalendarInitialView(undefined, 'monthView', 'list')).toBe('list');
		expect(resolveCalendarInitialView('bogus', 'weekView', 'month')).toBe('month');
	});

	it('falls back to the settings default, then month', () => {
		expect(resolveCalendarInitialView(undefined, 'weekView', null)).toBe('week');
		expect(resolveCalendarInitialView(undefined, 'bogus-setting', null)).toBe('month');
		expect(resolveCalendarInitialView(undefined, 'bogus-setting', 'bogus-saved')).toBe('month');
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

	it("treats an unmeasurable width as wide — today's behaviour, unchanged", () => {
		for (const width of [null, undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(resolveCalendarLayout(width)).toBe('wide');
		}
	});
});

describe('resolveCalendarInitialView — the width joins the order (#104, #119)', () => {
	it('a link beats the width', () => {
		expect(resolveCalendarInitialView('day', 'dayView', null, 320)).toBe('day');
		expect(resolveCalendarInitialView('list', 'dayView', null, 375)).toBe('list');
	});

	it('a narrow screen opens on month, whatever was used last (#119)', () => {
		for (const view of CALENDAR_VIEWS) {
			for (const width of [320, 375, 414, 767]) {
				expect(
					resolveCalendarInitialView(undefined, 'dayView', view, width),
					`${view} @ ${width}px`
				).toBe('month');
			}
		}
	});

	it('a stored view still wins from the breakpoint up', () => {
		for (const view of CALENDAR_VIEWS) {
			for (const width of [768, 834, 1024, 1440]) {
				expect(resolveCalendarInitialView(undefined, 'dayView', view, width), `${view} @ ${width}px`).toBe(
					view
				);
			}
		}
	});

	it('falls to month on a narrow screen and to the setting on a wide one', () => {
		expect(resolveCalendarInitialView(undefined, 'dayView', null, 320)).toBe('month');
		expect(resolveCalendarInitialView(undefined, 'dayView', null, 375)).toBe('month');
		expect(resolveCalendarInitialView(undefined, 'dayView', null, 767)).toBe('month');
		expect(resolveCalendarInitialView(undefined, 'dayView', null, 768)).toBe('day');
		expect(resolveCalendarInitialView(undefined, 'weekView', null, 1440)).toBe('week');
	});

	it('keeps the shipped day-view default intact off a narrow screen', () => {
		expect(resolveCalendarInitialView(undefined, 'dayView', null, 1024)).toBe('day');
		expect(resolveCalendarInitialView(undefined, 'dayView', null, null)).toBe('day');
	});

	it('an unusable stored view is not a preference — the width still speaks', () => {
		expect(resolveCalendarInitialView(undefined, 'dayView', 'bogus-saved', 320)).toBe('month');
		expect(resolveCalendarInitialView(undefined, 'dayView', 'bogus-saved', 1440)).toBe('day');
	});

	it('an unknown width is not a narrow screen — no behaviour change at all', () => {
		expect(resolveCalendarInitialView(undefined, 'dayView', null, null)).toBe('day');
		expect(resolveCalendarInitialView(undefined, 'weekView', null, null)).toBe('week');
		expect(resolveCalendarInitialView(undefined, 'bogus-setting', null, null)).toBe('month');
	});
});

/**
 * #119 — the shared DayNav can say "you are already on today". That needs one
 * question answered per view: is the period on screen the current one?
 */
describe('isCalendarCurrentPeriod (#119)', () => {
	const now = DateTime.fromISO('2026-09-30T14:00:00');

	it('compares at the granularity of the view, not the day', () => {
		expect(isCalendarCurrentPeriod('month', DateTime.fromISO('2026-09-01T00:00:00'), now)).toBe(true);
		expect(isCalendarCurrentPeriod('month', DateTime.fromISO('2026-10-01T00:00:00'), now)).toBe(false);
		expect(isCalendarCurrentPeriod('week', DateTime.fromISO('2026-09-28T00:00:00'), now)).toBe(true);
		expect(isCalendarCurrentPeriod('week', DateTime.fromISO('2026-10-05T00:00:00'), now)).toBe(false);
		expect(isCalendarCurrentPeriod('day', DateTime.fromISO('2026-09-30T23:30:00'), now)).toBe(true);
		expect(isCalendarCurrentPeriod('day', DateTime.fromISO('2026-09-29T23:30:00'), now)).toBe(false);
	});

	it('treats the list view as one day, because that is what it draws', () => {
		expect(isCalendarCurrentPeriod('list', DateTime.fromISO('2026-09-30T08:00:00'), now)).toBe(true);
		expect(isCalendarCurrentPeriod('list', DateTime.fromISO('2026-09-29T08:00:00'), now)).toBe(false);
	});

	it('ignores the time of day, because a period is not an instant', () => {
		for (const view of CALENDAR_VIEWS) {
			expect(isCalendarCurrentPeriod(view, DateTime.fromISO('2026-09-30T00:00:01'), now), view).toBe(true);
			expect(isCalendarCurrentPeriod(view, DateTime.fromISO('2026-09-30T23:59:59'), now), view).toBe(true);
		}
	});

	it('crosses a year boundary on the calendar, not on the week-number', () => {
		const nye = DateTime.fromISO('2026-12-31T09:00:00');
		expect(isCalendarCurrentPeriod('month', DateTime.fromISO('2027-01-01T00:00:00'), nye)).toBe(false);
		expect(isCalendarCurrentPeriod('month', DateTime.fromISO('2026-12-01T00:00:00'), nye)).toBe(true);
	});
});

describe('canSwipeNavigate (#048)', () => {
	it('navigates on month-view horizontal flings', () => {
		expect(canSwipeNavigate('month', -80, 10)).toBe(true);
		expect(canSwipeNavigate('month', 80, -10)).toBe(true);
	});

	it('ignores taps and vertical scrolls on month view', () => {
		expect(canSwipeNavigate('month', 30, 5)).toBe(false);
		expect(canSwipeNavigate('month', -80, 70)).toBe(false);
		expect(canSwipeNavigate('month', 0, 0)).toBe(false);
	});

	it('never navigates off month view (week/day pan, list scrolls)', () => {
		for (const view of ['week', 'list', 'day'] as const) {
			expect(canSwipeNavigate(view, -200, 0)).toBe(false);
			expect(canSwipeNavigate(view, 200, 0)).toBe(false);
		}
	});
});
