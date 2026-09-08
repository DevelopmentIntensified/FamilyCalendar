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
 * Initial view resolution order: explicit ?view= deep link, last-used view
 * from storage, settings default, month. Pure — callers own the storage read
 * (SSR-safe) and pass the raw stored string (or null).
 */
export function resolveInitialView(
	initialView: string | undefined,
	defaultViewSetting: string,
	storedView: string | null
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
	return viewFromSettingKey(defaultViewSetting) ?? 'month';
}
