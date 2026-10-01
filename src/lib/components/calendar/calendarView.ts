/** Shared calendar view vocabulary (#041, extracted from Calendar.svelte). */
import type { DateTime } from 'luxon';

export type CalendarView = 'month' | 'week' | 'list' | 'day';

/** Settings keys look like `monthView`; unknown keys fall through. */
export function viewFromSettingKey(key: string): CalendarView | undefined {
	if (key === 'monthView') return 'month';
	if (key === 'weekView') return 'week';
	if (key === 'listView') return 'list';
	if (key === 'dayView') return 'day';
	return undefined;
}

/** View names ('month' | 'week' | ...) as stored in localStorage. */
export function viewFromName(name: string): CalendarView | undefined {
	return viewFromSettingKey(`${name}View`);
}

/**
 * #104 — the one width rule. 768px is Tailwind's `md`, so the boundary this
 * file names and the boundary the stylesheets use are the same number, and a
 * change to one is visible in the other.
 *
 *   < 768px  'narrow'   a phone: one day fills the screen, so a day/ week-grid
 *                       opening reads as "the calendar disappeared". The month
 *                       grid is the only view that shows a whole period, and
 *                       MonthView already survives 320px (min-w-0, cols-7).
 *   >= 768px 'wide'     room for the day grid's hour gutter and a real column;
 *                       the settings default is a legitimate opening.
 *
 * Named by what the width IS, not by the device it usually arrives on: a 768px
 * tablet and a 768px browser window are the same layout problem.
 */
export const VIEW_BREAKPOINT_PX = 768;

export type CalendarLayout = 'narrow' | 'wide';

/**
 * #119 — the media query that means "this is a phone: a day tap opens the
 * day-action sheet instead of the day grid".
 *
 * Derived from the one breakpoint rather than typed out. It used to be a
 * literal `(max-width: 767px)` in MonthDays while the month cell revealed its
 * per-cell tools at Tailwind's `sm` (640px), so 640–767px was in sheet mode AND
 * showing per-cell tools — two answers to the same tap. The exact complement of
 * `md:` is the only value that can stay true as the breakpoint moves.
 */
export function smallScreenQuery(): string {
	return `(max-width: ${VIEW_BREAKPOINT_PX - 1}px)`;
}

/**
 * An unmeasurable width (SSR has no window; 0/NaN is a broken reading) is not
 * a phone, so it resolves 'wide' — today's behaviour, untouched. Never let a
 * failed measurement change what a user sees.
 */
export function resolveCalendarLayout(width: number | null | undefined): CalendarLayout {
	return typeof width === 'number' && Number.isFinite(width) && width > 0 && width < VIEW_BREAKPOINT_PX
		? 'narrow'
		: 'wide';
}

/**
 * Initial view resolution order: explicit ?view= deep link, the width, the
 * last-used view from storage, the settings default, month. Pure — callers own
 * the storage read (SSR-safe), the width read, and pass the raw stored string
 * (or null) plus the raw width (or null).
 *
 * The width sits BELOW a ?view= link, which is a statement about this screen,
 * and ABOVE everything else. It used to sit below the stored view too (#104),
 * on the reasoning that a phone should never overrule a stated preference.
 * #119 supersedes that: the month grid is the phone's opening view. A stored
 * view is remembered across devices, so a phone inherits a week or a day grid
 * picked on a laptop — and the first screen stops being the calendar at all,
 * which is exactly mark 1.1 ("the calendar disappears"). Day and week are one
 * tap away, so nothing is taken away; the opening is just the view that shows
 * a whole period. A wide screen is untouched: the stored view and the settings
 * default both still speak there.
 */
export function resolveInitialView(
	initialView: string | undefined,
	defaultViewSetting: string,
	storedView: string | null,
	width?: number | null
): CalendarView {
	if (
		initialView === 'month' ||
		initialView === 'week' ||
		initialView === 'day' ||
		initialView === 'list'
	) {
		return initialView;
	}
	if (resolveCalendarLayout(width) === 'narrow') return 'month';
	if (storedView !== null) {
		const restored = viewFromName(storedView);
		if (restored) return restored;
	}
	return viewFromSettingKey(defaultViewSetting) ?? 'month';
}

/**
 * #119 — is the period on screen the current one?
 *
 * The shared DayNav can say so (`aria-current="date"` and a muted Today), which
 * the calendar's hand-built pager never could. It is a view question, so it
 * belongs beside the rest of the view vocabulary rather than inside a toolbar
 * that does not own the date.
 *
 * Compared at the granularity of what the view DRAWS: a month is a month, a
 * week is a week, a day and the list view are the day they show. Time of day is
 * never part of it — a period is not an instant.
 */
const PERIOD_UNIT: Record<CalendarView, 'month' | 'week' | 'day'> = {
	month: 'month',
	week: 'week',
	day: 'day',
	list: 'day'
};

export function isCurrentPeriod(view: CalendarView, date: DateTime, now: DateTime): boolean {
	return date.hasSame(now, PERIOD_UNIT[view]);
}

/**
 * Swipe-nav gate (#048): only the month grid has no horizontal panning,
 * so only it may navigate on a horizontal fling. Week/day grids pan
 * horizontally (day columns overflow) — a fling there is a pan, not nav.
 * List scrolls vertically. Pure for testing; Calendar.svelte owns touch.
 */
export function shouldSwipeNavigate(view: CalendarView, dx: number, dy: number): boolean {
	if (view !== 'month') return false;
	return Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5;
}
