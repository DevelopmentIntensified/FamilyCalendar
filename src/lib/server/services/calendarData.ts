/**
 * Calendar page scope (#292 L0 G2): which calendars the viewer sees, with
 * the name + colour the /calendar loader gives them. Extracted so the page
 * and `GET /api/calendars` agree on one answer.
 */
import { db } from '$lib/server/db';
import {
	calendars,
	families,
	type Calendar,
	type CalendarEvent,
	type UserSettings
} from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { ensurePersonalCalendar } from '$lib/server/db/actions/calendar';
import { getAdEventsForUser, shouldServeAds, type AdDisplayEvent } from '$lib/server/services/adService';
import { parseEvents } from '$lib/server/services/eventDisplayService';
import { getTodayVerse, getVerseForDate, type DailyVerse } from '$lib/server/services/verseService';
import { getFamilyModuleSwitches } from '$lib/server/db/actions/dashboardModules';
import { dashboardVisibility } from '$lib/dashboardModules';
import { guard } from '$lib/server/utils/guard';

export const PERSONAL_CALENDAR_NAME = 'Personal Calendar';
export const DEFAULT_PERSONAL_COLOR = '#fa8072';
export const DEFAULT_FAMILY_COLOR = '#e0ffff';

export type CalendarSummary = {
	id: string;
	name: string;
	color: string;
	kind: 'personal' | 'family';
};

/** The personal calendar's display colour (settings `color`, else salmon). */
export function personalCalendarColor(settings: { color?: string | null } | null | undefined) {
	return settings?.color || DEFAULT_PERSONAL_COLOR;
}

/**
 * The family's calendar (the first one, as the loader reads it) plus its
 * display name + colour. `calendar` is null when the family has none yet;
 * `color` is still the family's colour (the loader tints with it anyway).
 */
export async function getFamilyCalendarInfo(familyId: string): Promise<{
	calendar: Calendar | null;
	name: string;
	color: string;
}> {
	const [family] = await db.select().from(families).where(eq(families.id, familyId));
	const color = family?.color || DEFAULT_FAMILY_COLOR;
	const familyCals = await db.select().from(calendars).where(eq(calendars.familyId, familyId));
	return {
		calendar: familyCals[0] ?? null,
		name: family?.name || 'Family Calendar',
		color
	};
}

/** Sponsored (ad) events render in this amber on every calendar view. */
export const SPONSORED_EVENT_COLOR = '#f59e0b';

/** Project an ad display event onto the stored event row shape (stored-only fields are null). */
function toCalendarEvent(ad: AdDisplayEvent): CalendarEvent {
	return {
		...ad,
		recurrenceByDay: null,
		recurrenceCount: null,
		recurrenceUntil: null,
		reminderMinutes: null,
		mirrorOf: null
	};
}

/**
 * G6: the month's sponsored events — `[]` unless the user opted in
 * (`shouldServeAds`, one field on the settings row, #088). `month` is 1–12.
 */
export async function loadSponsoredEvents(
	userId: string,
	settings: { showAdsAsEvents?: boolean | null } | null | undefined,
	month: number,
	year: number
): Promise<CalendarEvent[]> {
	if (!shouldServeAds(settings)) return [];
	return (await getAdEventsForUser(userId, month, year)).map(toCalendarEvent);
}

/** The display projection the calendar renders ad rows with. */
export function toSponsoredDisplay(rows: CalendarEvent[], zone: string) {
	return parseEvents(rows, zone).map((e) => ({ ...e, color: SPONSORED_EVENT_COLOR }));
}

/**
 * G7: the Daily Verse, or null when it is hidden. Visibility is a function
 * of BOTH persisted facts — the `showDailyVerse` setting and the Dashboard
 * Module switch — so it asks the one shared answer (109). `dateIso` picks
 * the day (default: today). `warning` = the switch read failed (the verse
 * then follows the setting alone, the loader's degrade).
 */
export async function loadDailyVerse(
	settings: UserSettings | null | undefined,
	familyId: string | null,
	dateIso?: string
): Promise<{ verse: DailyVerse | null; warning: string | null }> {
	const switchesG = await guard('settings', {}, async () =>
		familyId ? await getFamilyModuleSwitches(familyId) : {}
	);
	const visibility = dashboardVisibility({ settings, familySwitches: switchesG.data });
	if (!visibility.needs('verse')) return { verse: null, warning: switchesG.error };
	const translation = settings?.verseTranslation ?? 'esv';
	const verse = dateIso
		? await getVerseForDate(dateIso, translation)
		: await getTodayVerse(translation);
	return { verse, warning: switchesG.error };
}

/** Personal first, then the family calendar (when the viewer has one). */
export async function listCalendarsForUser(
	userId: string,
	settings: { color?: string | null } | null | undefined,
	familyId: string | null
): Promise<CalendarSummary[]> {
	const [personal, fam] = await Promise.all([
		ensurePersonalCalendar(userId),
		familyId ? getFamilyCalendarInfo(familyId) : Promise.resolve(null)
	]);
	const out: CalendarSummary[] = [];
	if (personal) {
		out.push({
			id: personal.id,
			name: PERSONAL_CALENDAR_NAME,
			color: personalCalendarColor(settings),
			kind: 'personal'
		});
	}
	if (fam?.calendar) {
		out.push({ id: fam.calendar.id, name: fam.name, color: fam.color, kind: 'family' });
	}
	return out;
}
