/** Shared calendar view vocabulary (#041, extracted from Calendar.svelte). */

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
 * Initial view resolution order: explicit ?view= deep link, last-used view
 * from storage, the width, settings default, month. Pure — callers own the
 * storage read (SSR-safe), the width read, and pass the raw stored string
 * (or null) plus the raw width (or null).
 *
 * The width sits BELOW both inputs that mean "the user chose this": tapping a
 * view button, or arriving on a link that names one. A phone is not a reason to
 * overrule a stated preference — it only settles the opening for someone who
 * has not stated one. It also sits ABOVE the settings default, which is why a
 * phone with nothing stored opens on month rather than the shipped `dayView`.
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
	if (storedView !== null) {
		const restored = viewFromName(storedView);
		if (restored) return restored;
	}
	if (resolveCalendarLayout(width) === 'narrow') return 'month';
	return viewFromSettingKey(defaultViewSetting) ?? 'month';
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
