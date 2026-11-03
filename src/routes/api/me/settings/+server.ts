import { json } from '@sveltejs/kit';
import { DateTime } from 'luxon';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import { TRANSLATIONS } from '$lib/server/services/verseService';
import {
	ACCOUNT_SETTINGS_DEFAULTS,
	loadAccountSettings,
	saveCalendarSettings,
	type CalendarSettingsInput
} from '$lib/server/services/accountData';

/** The values the /account form offers (AccountCalendarSection). */
const WEEK_STARTS = ['sunday', 'monday'];
const DEFAULT_VIEWS = ['dayView', 'weekView', 'monthView', 'listView', 'dashboard'];
const BOOLEAN_FIELDS = [
	'syncEventsToFamilyCalendar',
	'autoParseEventDetails',
	'showDailyVerse',
	'showAdsAsEvents'
] as const;
const PATCHABLE = new Set<string>([
	'weekStart',
	'timeZone',
	'color',
	'defaultView',
	'defaultCalendarId',
	'verseTranslation',
	...BOOLEAN_FIELDS
]);

/**
 * GET /api/me/settings (#292 G3) — the /account settings card's data.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	return json(await loadAccountSettings(auth.user.id));
};

/** Validates a PATCH body; returns the patch or an error message. */
function parsePatch(body: unknown): { patch: Partial<CalendarSettingsInput> } | { error: string } {
	if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid body' };
	const b = body as Record<string, unknown>;
	for (const key of Object.keys(b)) {
		if (!PATCHABLE.has(key)) return { error: `Unknown field: ${key}` };
	}
	const patch: Partial<CalendarSettingsInput> = {};
	if ('weekStart' in b) {
		if (typeof b.weekStart !== 'string' || !WEEK_STARTS.includes(b.weekStart))
			return { error: 'Invalid weekStart' };
		patch.weekStart = b.weekStart;
	}
	if ('timeZone' in b) {
		if (typeof b.timeZone !== 'string' || !DateTime.local().setZone(b.timeZone).isValid)
			return { error: 'Invalid timeZone' };
		patch.timeZone = b.timeZone;
	}
	if ('color' in b) {
		if (typeof b.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(b.color))
			return { error: 'Invalid color' };
		patch.color = b.color;
	}
	if ('defaultView' in b) {
		if (typeof b.defaultView !== 'string' || !DEFAULT_VIEWS.includes(b.defaultView))
			return { error: 'Invalid defaultView' };
		patch.defaultView = b.defaultView;
	}
	if ('defaultCalendarId' in b) {
		if (b.defaultCalendarId !== null && typeof b.defaultCalendarId !== 'string')
			return { error: 'Invalid defaultCalendarId' };
		patch.defaultCalendarId = b.defaultCalendarId || null;
	}
	if ('verseTranslation' in b) {
		if (typeof b.verseTranslation !== 'string' || !(b.verseTranslation in TRANSLATIONS))
			return { error: 'Invalid verseTranslation' };
		patch.verseTranslation = b.verseTranslation;
	}
	for (const key of BOOLEAN_FIELDS) {
		if (key in b) {
			if (typeof b[key] !== 'boolean') return { error: `Invalid ${key}` };
			patch[key] = b[key];
		}
	}
	return { patch };
}

/**
 * PATCH /api/me/settings (#292 G3) — any subset of the calendar-settings
 * fields; the rest keep their stored value. Writes through the same
 * saveCalendarSettings as the /account form (default-calendar access check,
 * ad-consent trail). `{timeZone}` alone replaces the web-only
 * /calendar/setUserDefaultTimeZone.
 */
export const PATCH: RequestHandler = async ({ locals, request }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const userId = auth.user.id;
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}
	const parsed = parsePatch(body);
	if ('error' in parsed) return json({ error: parsed.error }, { status: 400 });

	const existing = await getUserSettings(userId);
	const base = existing ?? ACCOUNT_SETTINGS_DEFAULTS;
	const input: CalendarSettingsInput = {
		weekStart: base.weekStart ?? ACCOUNT_SETTINGS_DEFAULTS.weekStart,
		timeZone: base.timeZone ?? ACCOUNT_SETTINGS_DEFAULTS.timeZone,
		color: base.color ?? ACCOUNT_SETTINGS_DEFAULTS.color,
		defaultView: base.defaultView ?? ACCOUNT_SETTINGS_DEFAULTS.defaultView,
		defaultCalendarId: base.defaultCalendarId ?? null,
		syncEventsToFamilyCalendar: base.syncEventsToFamilyCalendar ?? false,
		autoParseEventDetails: existing?.autoParseEventDetails ?? true,
		showDailyVerse: existing?.showDailyVerse ?? false,
		showAdsAsEvents: base.showAdsAsEvents ?? false,
		verseTranslation: base.verseTranslation ?? 'esv',
		...parsed.patch
	};
	// Only a default calendar this PATCH sets is re-checked: a stored one is
	// not re-validated on an unrelated change (e.g. the timezone auto-set).
	const result = await saveCalendarSettings(userId, input, {
		checkDefaultCalendar: 'defaultCalendarId' in parsed.patch
	});
	if (!result.ok) return json({ error: result.message }, { status: result.status });
	return json(await loadAccountSettings(userId));
};
