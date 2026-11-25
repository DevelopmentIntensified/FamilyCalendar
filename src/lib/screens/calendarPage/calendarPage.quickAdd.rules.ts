/**
 * The Quick Add parser gate: the person's two stored switches, resolved the way
 * legacy's `EventFormModal` read them off `data.userSettings`.
 *
 * Only an explicit `false` turns the auto-parse off (`:318` `if
 * (userSettings?.autoParseEventDetails === false) return;`) — an absent or null
 * setting parses. `useCloud` is the cloud switch with an `?? true` default
 * (`:247` `useCloud: userSettings?.useCloudAI ?? true`), so an unset setting
 * asks the route's cloud path and only `false` keeps the phrase local.
 *
 * Both are read-only columns (identity Q-014); nothing here writes them.
 */
import type { CalendarPageSettings } from './calendarPage.contract';

/** What the create sheet does with a typed phrase. */
export interface CalendarQuickAddSettings {
	/** Parse 300 ms after typing stops. */
	readonly autoParse: boolean;
	/** Let `POST /api/parse-event` consider its cloud path. */
	readonly useCloud: boolean;
}

/** The two switches, with legacy's defaults for an absent row. */
export function calendarQuickAddSettings(
	settings: Pick<CalendarPageSettings, 'autoParseEventDetails' | 'useCloudAI'>
): CalendarQuickAddSettings {
	return {
		autoParse: settings.autoParseEventDetails !== false,
		useCloud: settings.useCloudAI ?? true
	};
}
