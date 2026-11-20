/**
 * identity settings rules: the calendar-settings vocabularies, the page
 * defaults, the `PATCH /api/me/settings` validator, the merge onto the stored
 * row, the default-calendar decision, the client view and the write allowlist.
 *
 * Nothing here reads the clock, the environment or the database (R4/R5). The
 * zone check takes no "now": a zone's validity does not depend on the instant.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import type {
	CalendarSettingsInput,
	CalendarSettingsPatch,
	CalendarSettingsView,
	StoredCalendarSettings
} from './identity.contract';

/** The week starts the /account form offers. */
export const WEEK_STARTS = ['sunday', 'monday'] as const;

/** The calendar views the /account form offers. */
export const DEFAULT_VIEWS = ['dayView', 'weekView', 'monthView', 'listView', 'dashboard'] as const;

/** The boolean settings, in the order the PATCH validator checks them. */
export const SETTINGS_BOOLEAN_FIELDS = [
	'syncEventsToFamilyCalendar',
	'autoParseEventDetails',
	'showDailyVerse',
	'showAdsAsEvents'
] as const;

/** Everything a PATCH may name, in check order; any other key is `Unknown field: <key>`. */
export const SETTINGS_PATCH_FIELDS = [
	'weekStart',
	'timeZone',
	'color',
	'defaultView',
	'defaultCalendarId',
	...SETTINGS_BOOLEAN_FIELDS
] as const;

/**
 * The columns a settings write may touch (#168: an explicit allowlist, so a
 * new column stays unwritable until added here on purpose). `useCloudAI` /
 * `useLocalAI` are absent on purpose (Q-014: read-only until a schema ticket
 * drops them). `verseTranslation` is still listed, as in legacy, though no
 * caller writes it since Q-031/Q-032.
 */
export const SETTINGS_WRITABLE_FIELDS = [
	'weekStart',
	'timeZone',
	'color',
	'syncEventsToFamilyCalendar',
	'showAdsAsEvents',
	'autoParseEventDetails',
	'showDailyVerse',
	'verseTranslation',
	'hiddenDashboardModules',
	'defaultCalendarId',
	'defaultView'
] as const;

/** The 400 for a PATCH body that is not a JSON object. */
export const SETTINGS_BODY_INVALID_MESSAGE = 'Invalid body';

/**
 * What /account shows when the person has no settings row. Ads are opt-in
 * (#088): no row means no ads.
 */
export const ACCOUNT_SETTINGS_DEFAULTS = {
	weekStart: 'sunday',
	timeZone: 'UTC',
	color: '#3b82f6',
	defaultView: 'dayView',
	defaultCalendarId: null,
	syncEventsToFamilyCalendar: false,
	showAdsAsEvents: false
} as const;

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

type SettingsPatchField = (typeof SETTINGS_PATCH_FIELDS)[number];
type SettingsWritableField = (typeof SETTINGS_WRITABLE_FIELDS)[number];

/**
 * A zone is valid when Luxon can set it (legacy `DateTime.local().setZone(z).isValid`).
 * That is not IANA membership: `local`, `system`, `default`, `UTC+5` and `gmt`
 * all pass and are stored verbatim (Q-107 narrows this after S6). The base
 * instant is fixed because validity never depends on it.
 */
export function isLuxonTimeZone(zone: string): boolean {
	return DateTime.fromMillis(0).setZone(zone).isValid;
}

/** The outcome of validating a PATCH body: the patch, or the legacy 400 copy. */
export type CalendarSettingsPatchResult =
	| { readonly ok: true; readonly patch: CalendarSettingsPatch }
	| { readonly ok: false; readonly error: string };

/**
 * Legacy `parsePatch` (`src/routes/api/me/settings/+server.ts:41-80`), copy and
 * precedence exact:
 * 1. not a JSON object (array, null, scalar) → `Invalid body`;
 * 2. the first key outside the nine, in body order → `Unknown field: <key>`;
 * 3. the known keys in CODE order (weekStart, timeZone, color, defaultView,
 *    defaultCalendarId, then the booleans) → `Invalid <field>`.
 * A `defaultCalendarId` of `''` becomes `null` (`b.defaultCalendarId || null`).
 */
export function calendarSettingsPatch(body: unknown): CalendarSettingsPatchResult {
	if (!isJsonObject(body)) return refuse(SETTINGS_BODY_INVALID_MESSAGE);
	for (const key of Object.keys(body)) {
		if (!isPatchField(key)) return refuse(`Unknown field: ${key}`);
	}
	const patch: { -readonly [K in keyof CalendarSettingsInput]?: CalendarSettingsInput[K] } = {};
	if ('weekStart' in body) {
		const value = body.weekStart;
		if (typeof value !== 'string' || !WEEK_STARTS.some((start) => start === value)) {
			return refuse('Invalid weekStart');
		}
		patch.weekStart = value;
	}
	if ('timeZone' in body) {
		const value = body.timeZone;
		if (typeof value !== 'string' || !isLuxonTimeZone(value)) return refuse('Invalid timeZone');
		patch.timeZone = value;
	}
	if ('color' in body) {
		const value = body.color;
		if (typeof value !== 'string' || !COLOR_PATTERN.test(value)) return refuse('Invalid color');
		patch.color = value;
	}
	if ('defaultView' in body) {
		const value = body.defaultView;
		if (typeof value !== 'string' || !DEFAULT_VIEWS.some((view) => view === value)) {
			return refuse('Invalid defaultView');
		}
		patch.defaultView = value;
	}
	if ('defaultCalendarId' in body) {
		const value = body.defaultCalendarId;
		if (value !== null && typeof value !== 'string') return refuse('Invalid defaultCalendarId');
		patch.defaultCalendarId = value || null;
	}
	for (const key of SETTINGS_BOOLEAN_FIELDS) {
		if (key in body) {
			const value = body[key];
			if (typeof value !== 'boolean') return refuse(`Invalid ${key}`);
			patch[key] = value;
		}
	}
	return { ok: true, patch };
}

/**
 * The full set a PATCH saves: the stored row (or the page defaults when there
 * is none) with every null backfilled from the defaults, then the patch on top
 * (`settings/+server.ts:102-115`). A sparse sign-up row therefore gets its
 * `color` and `syncEventsToFamilyCalendar` filled by its first PATCH (Q-108
 * changes that after S6). `autoParseEventDetails` / `showDailyVerse` fall back
 * to their column defaults, which are not page defaults.
 */
export function mergeCalendarSettings(
	stored: StoredCalendarSettings | null,
	patch: CalendarSettingsPatch
): CalendarSettingsInput {
	return {
		weekStart: stored?.weekStart ?? ACCOUNT_SETTINGS_DEFAULTS.weekStart,
		timeZone: stored?.timeZone ?? ACCOUNT_SETTINGS_DEFAULTS.timeZone,
		color: stored?.color ?? ACCOUNT_SETTINGS_DEFAULTS.color,
		defaultView: stored?.defaultView ?? ACCOUNT_SETTINGS_DEFAULTS.defaultView,
		defaultCalendarId: stored?.defaultCalendarId ?? null,
		syncEventsToFamilyCalendar: stored?.syncEventsToFamilyCalendar ?? false,
		autoParseEventDetails: stored?.autoParseEventDetails ?? true,
		showDailyVerse: stored?.showDailyVerse ?? false,
		showAdsAsEvents: stored?.showAdsAsEvents ?? false,
		...patch
	};
}

/**
 * The default calendar the save must verify is visible to the caller, or null
 * for none. Only an id THIS patch sets is checked: a stored one is not
 * re-validated on an unrelated change such as the timezone auto-set
 * (`settings/+server.ts:116-121`), and clearing it needs no check
 * (legacy truthiness, `accountData.ts:167`).
 */
export function defaultCalendarToCheck(patch: CalendarSettingsPatch): string | null {
	return patch.defaultCalendarId || null;
}

/**
 * What a client sees: the page defaults for no row, else the row without
 * `verseTranslation` (no reader since Q-031/Q-032; the column stays).
 */
export function calendarSettingsView(stored: StoredCalendarSettings | null): CalendarSettingsView {
	if (!stored) return ACCOUNT_SETTINGS_DEFAULTS;
	const { verseTranslation: _stripped, ...view } = stored;
	void _stripped;
	return view;
}

/** The subset of a settings write the allowlist lets through. */
export type SettingsWrite = {
	-readonly [K in SettingsWritableField]?: StoredCalendarSettings[K];
};

/**
 * Drops every key outside `SETTINGS_WRITABLE_FIELDS` and every `undefined`
 * value, keeping explicit `null`s (legacy `pickWritableFields`): mass
 * assignment cannot reach `id`, `userId`, `updatedAt` or the AI flags even
 * through a cast.
 */
export function writableSettings(data: Partial<StoredCalendarSettings>): SettingsWrite {
	const write: SettingsWrite = {};
	for (const field of SETTINGS_WRITABLE_FIELDS) copyDefined(write, data, field);
	return write;
}

function copyDefined<K extends SettingsWritableField>(
	write: SettingsWrite,
	data: Partial<StoredCalendarSettings>,
	field: K
): void {
	const value = data[field];
	if (value !== undefined) write[field] = value;
}

function isJsonObject(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPatchField(key: string): key is SettingsPatchField {
	return SETTINGS_PATCH_FIELDS.some((field) => field === key);
}

function refuse(error: string): CalendarSettingsPatchResult {
	return { ok: false, error };
}
