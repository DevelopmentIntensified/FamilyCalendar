/**
 * identity settings rules: the calendar-settings vocabularies, the page
 * defaults, the `PATCH /api/me/settings` validator, the new-row builder, the
 * default-calendar decision, the client view and the write allowlist.
 *
 * Nothing here reads the clock, the environment or the database (R4/R5). The
 * zone check takes no "now": a zone's validity does not depend on the instant.
 *
 * Doc: ./README.md#invariants
 */
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

/**
 * An IANA identifier shape: a name, optionally path-like, never a bare fixed
 * offset (`+05:00`, which ICU accepts as a zone but no calendar reader does).
 */
const IANA_ZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;

type SettingsPatchField = (typeof SETTINGS_PATCH_FIELDS)[number];
type SettingsWritableField = (typeof SETTINGS_WRITABLE_FIELDS)[number];

/**
 * A zone is valid when it is an IANA name (aliases and `Etc/…` included) or
 * `UTC`, whatever the casing (Q-107 B): ICU's `timeZone` set is the tz
 * database, and it refuses Luxon's server-relative pseudo-zones (`local`,
 * `system`, `default`) and its fixed-offset forms (`UTC+5`). Legacy accepted
 * those through `DateTime.local().setZone(z).isValid` and stored them verbatim,
 * so `local` followed the server's zone instead of the person's; they now get
 * the same `400 Invalid timeZone` as an unknown name. `gmt` stays accepted on
 * purpose: ICU resolves it to GMT/UTC, never to the server's zone (sheet Note).
 */
export function isIanaTimeZone(zone: string): boolean {
	if (!IANA_ZONE_PATTERN.test(zone)) return false;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: zone });
		return true;
	} catch {
		return false;
	}
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
		if (typeof value !== 'string' || !isIanaTimeZone(value)) return refuse('Invalid timeZone');
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
 * The row a save CREATES when the person had none: the page defaults (plus the
 * two column defaults the page does not offer), then the patch on top. Only
 * the insert path needs a full row — required columns such as `weekStart` and
 * `timeZone` have no database default of their own. A PATCH on an existing row
 * writes only the keys it sent (Q-108 B), so it never backfills a sparse
 * sign-up row's nulls.
 */
export function newCalendarSettings(patch: CalendarSettingsPatch): CalendarSettingsInput {
	return {
		weekStart: patch.weekStart ?? ACCOUNT_SETTINGS_DEFAULTS.weekStart,
		timeZone: patch.timeZone ?? ACCOUNT_SETTINGS_DEFAULTS.timeZone,
		color: patch.color ?? ACCOUNT_SETTINGS_DEFAULTS.color,
		defaultView: patch.defaultView ?? ACCOUNT_SETTINGS_DEFAULTS.defaultView,
		defaultCalendarId: patch.defaultCalendarId ?? null,
		syncEventsToFamilyCalendar:
			patch.syncEventsToFamilyCalendar ?? ACCOUNT_SETTINGS_DEFAULTS.syncEventsToFamilyCalendar,
		autoParseEventDetails: patch.autoParseEventDetails ?? true,
		showDailyVerse: patch.showDailyVerse ?? false,
		showAdsAsEvents: patch.showAdsAsEvents ?? ACCOUNT_SETTINGS_DEFAULTS.showAdsAsEvents
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
 * What a client sees (Q-108 B): the page defaults when there is no row, else
 * the row without `verseTranslation` (no reader since Q-031/Q-032; the column
 * stays) and with every null page column answered as its default. A sign-up
 * row `{userId, timeZone}` therefore answers `color:'#3b82f6'` and
 * `syncEventsToFamilyCalendar:false`, exactly like a person with no row —
 * one merged view, not two answers for "never set". Columns the page does not
 * offer (`autoParseEventDetails`, `showDailyVerse`,
 * `hiddenDashboardModules`) are echoed as stored.
 */
export function calendarSettingsView(stored: StoredCalendarSettings | null): CalendarSettingsView {
	if (!stored) return ACCOUNT_SETTINGS_DEFAULTS;
	const { verseTranslation: _stripped, ...view } = stored;
	void _stripped;
	return {
		...view,
		weekStart: view.weekStart ?? ACCOUNT_SETTINGS_DEFAULTS.weekStart,
		timeZone: view.timeZone ?? ACCOUNT_SETTINGS_DEFAULTS.timeZone,
		color: view.color ?? ACCOUNT_SETTINGS_DEFAULTS.color,
		defaultView: view.defaultView ?? ACCOUNT_SETTINGS_DEFAULTS.defaultView,
		defaultCalendarId: view.defaultCalendarId ?? ACCOUNT_SETTINGS_DEFAULTS.defaultCalendarId,
		syncEventsToFamilyCalendar:
			view.syncEventsToFamilyCalendar ?? ACCOUNT_SETTINGS_DEFAULTS.syncEventsToFamilyCalendar,
		showAdsAsEvents: view.showAdsAsEvents ?? ACCOUNT_SETTINGS_DEFAULTS.showAdsAsEvents
	};
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
