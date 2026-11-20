/**
 * Pure settings rules: the PATCH validator (copy, precedence, coercions), the
 * merge onto the stored row or the page defaults, the default-calendar
 * decision, the view that strips `verseTranslation`, the write allowlist and
 * the Luxon zone check. Expected values come from the legacy route
 * (`src/routes/api/me/settings/+server.ts`), `accountData.ts`,
 * `userSettings.ts` and their tests, never from running this code.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import type { CalendarSettingsPatch, StoredCalendarSettings } from './identity.contract';
import {
	ACCOUNT_SETTINGS_DEFAULTS,
	calendarSettingsPatch,
	calendarSettingsView,
	DEFAULT_VIEWS,
	defaultCalendarToCheck,
	isLuxonTimeZone,
	mergeCalendarSettings,
	SETTINGS_BODY_INVALID_MESSAGE,
	SETTINGS_PATCH_FIELDS,
	SETTINGS_WRITABLE_FIELDS,
	WEEK_STARTS,
	writableSettings
} from './identity.settings.rules';

/** The legacy route test's stored row (settings/server.test.ts:35-47) as a full row. */
const STORED: StoredCalendarSettings = {
	id: 'settings-a',
	userId: 'u1',
	weekStart: 'monday',
	timeZone: 'America/Chicago',
	color: '#112233',
	defaultView: 'dashboard',
	defaultCalendarId: 'cal-gone',
	syncEventsToFamilyCalendar: true,
	autoParseEventDetails: false,
	showDailyVerse: true,
	showAdsAsEvents: false,
	verseTranslation: 'esv',
	hiddenDashboardModules: ['board'],
	useCloudAI: true,
	useLocalAI: true,
	updatedAt: new Date('2026-10-07T13:00:00.000Z')
};

/** A sign-up row: `{userId, timeZone:'UTC'}` plus the column defaults (users.ts:138). */
const SPARSE: StoredCalendarSettings = {
	...STORED,
	weekStart: 'sunday',
	timeZone: 'UTC',
	color: null,
	defaultView: 'dayView',
	defaultCalendarId: null,
	syncEventsToFamilyCalendar: null,
	autoParseEventDetails: true,
	showDailyVerse: false,
	verseTranslation: 'esv',
	hiddenDashboardModules: null
};

describe('vocabularies', () => {
	it('offers the two week starts and five views the /account form offers', () => {
		expect(WEEK_STARTS).toEqual(['sunday', 'monday']);
		expect(DEFAULT_VIEWS).toEqual(['dayView', 'weekView', 'monthView', 'listView', 'dashboard']);
	});

	it('patches exactly nine fields, in the legacy check order', () => {
		expect(SETTINGS_PATCH_FIELDS).toEqual([
			'weekStart',
			'timeZone',
			'color',
			'defaultView',
			'defaultCalendarId',
			'syncEventsToFamilyCalendar',
			'autoParseEventDetails',
			'showDailyVerse',
			'showAdsAsEvents'
		]);
	});

	it('keeps the page defaults a no-row person sees (accountData.ts:49-58)', () => {
		expect(ACCOUNT_SETTINGS_DEFAULTS).toEqual({
			weekStart: 'sunday',
			timeZone: 'UTC',
			color: '#3b82f6',
			defaultView: 'dayView',
			defaultCalendarId: null,
			syncEventsToFamilyCalendar: false,
			showAdsAsEvents: false
		});
	});
});

describe('isLuxonTimeZone', () => {
	// Q-107 (post-S6) narrows this to IANA names plus UTC; today Luxon
	// `setZone(...).isValid` decides, so the pseudo-zones pass.
	it.each<[string, boolean]>([
		['UTC', true],
		['America/Chicago', true],
		['Asia/Tokyo', true],
		['local', true],
		['system', true],
		['default', true],
		['UTC+5', true],
		['gmt', true],
		['', false],
		['Mars/Base', false],
		['Not/AZone', false]
	])('%j → %s', (zone, expected) => {
		expect(isLuxonTimeZone(zone)).toBe(expected);
	});
});

describe('calendarSettingsPatch', () => {
	it.each<[string, unknown, CalendarSettingsPatch]>([
		['an empty object is an empty patch', {}, {}],
		['timeZone alone', { timeZone: 'Asia/Tokyo' }, { timeZone: 'Asia/Tokyo' }],
		['a Luxon pseudo-zone, stored as sent', { timeZone: 'UTC+5' }, { timeZone: 'UTC+5' }],
		['a mixed-case colour', { color: '#aBcDeF' }, { color: '#aBcDeF' }],
		['defaultCalendarId:null', { defaultCalendarId: null }, { defaultCalendarId: null }],
		['an empty defaultCalendarId is null', { defaultCalendarId: '' }, { defaultCalendarId: null }],
		['a default calendar id', { defaultCalendarId: 'cal-mine' }, { defaultCalendarId: 'cal-mine' }],
		[
			'five fields in one PATCH',
			{
				weekStart: 'sunday',
				color: '#00ff00',
				syncEventsToFamilyCalendar: false,
				autoParseEventDetails: true,
				showDailyVerse: false
			},
			{
				weekStart: 'sunday',
				color: '#00ff00',
				syncEventsToFamilyCalendar: false,
				autoParseEventDetails: true,
				showDailyVerse: false
			}
		],
		['showAdsAsEvents', { showAdsAsEvents: true }, { showAdsAsEvents: true }],
		['every view', { defaultView: 'listView' }, { defaultView: 'listView' }]
	])('accepts %s', (_label, body, patch) => {
		expect(calendarSettingsPatch(body)).toEqual({ ok: true, patch });
	});

	// The golden's 400 table plus the legacy route test (settings/server.test.ts:94-108).
	it.each<[string, unknown, string]>([
		['an array', [1], SETTINGS_BODY_INVALID_MESSAGE],
		['null', null, SETTINGS_BODY_INVALID_MESSAGE],
		['a string', 'nope', SETTINGS_BODY_INVALID_MESSAGE],
		['false', false, SETTINGS_BODY_INVALID_MESSAGE],
		['a number', 5, SETTINGS_BODY_INVALID_MESSAGE],
		['an unknown weekStart', { weekStart: 'friday' }, 'Invalid weekStart'],
		['a capitalised weekStart', { weekStart: 'Monday' }, 'Invalid weekStart'],
		['a null weekStart', { weekStart: null }, 'Invalid weekStart'],
		['an invalid zone', { timeZone: 'Mars/Base' }, 'Invalid timeZone'],
		['an empty zone', { timeZone: '' }, 'Invalid timeZone'],
		['a non-string zone', { timeZone: 5 }, 'Invalid timeZone'],
		['a named colour', { color: 'red' }, 'Invalid color'],
		['a short hex colour', { color: '#fff' }, 'Invalid color'],
		['an unknown view', { defaultView: 'yearView' }, 'Invalid defaultView'],
		['a numeric default calendar', { defaultCalendarId: 5 }, 'Invalid defaultCalendarId'],
		['a non-boolean ad flag', { showAdsAsEvents: 'yes' }, 'Invalid showAdsAsEvents'],
		['a numeric sync flag', { syncEventsToFamilyCalendar: 1 }, 'Invalid syncEventsToFamilyCalendar'],
		['a string autoParse flag', { autoParseEventDetails: 'yes' }, 'Invalid autoParseEventDetails'],
		['a string verse flag', { showDailyVerse: 'yes' }, 'Invalid showDailyVerse'],
		['the retired verseTranslation', { verseTranslation: 'esv' }, 'Unknown field: verseTranslation'],
		['the read-only useCloudAI (Q-014)', { useCloudAI: false }, 'Unknown field: useCloudAI'],
		['the read-only useLocalAI (Q-014)', { useLocalAI: false }, 'Unknown field: useLocalAI'],
		['the dashboard switches', { hiddenDashboardModules: [] }, 'Unknown field: hiddenDashboardModules'],
		// The unknown-key sweep runs before any value check (:44-46) ...
		['a bad value then an unknown key', { weekStart: 'friday', bogus: 1 }, 'Unknown field: bogus'],
		// ... and the first unknown key in body order is the one named.
		['two unknown keys', { zeta: 1, alpha: 2 }, 'Unknown field: zeta'],
		// ... and known keys are checked in code order, not body order (:48-78).
		['two bad values', { timeZone: 'Mars/Base', weekStart: 'friday' }, 'Invalid weekStart'],
		['two bad booleans', { showAdsAsEvents: 1, syncEventsToFamilyCalendar: 1 }, 'Invalid syncEventsToFamilyCalendar']
	])('refuses %s', (_label, body, error) => {
		expect(calendarSettingsPatch(body)).toEqual({ ok: false, error });
	});
});

describe('mergeCalendarSettings', () => {
	it('timeZone alone keeps every other stored field (settings/server.test.ts:115-131)', () => {
		expect(mergeCalendarSettings(STORED, { timeZone: 'Asia/Tokyo' })).toEqual({
			weekStart: 'monday',
			timeZone: 'Asia/Tokyo',
			color: '#112233',
			defaultView: 'dashboard',
			defaultCalendarId: 'cal-gone',
			syncEventsToFamilyCalendar: true,
			autoParseEventDetails: false,
			showDailyVerse: true,
			showAdsAsEvents: false
		});
	});

	it('builds from the page defaults plus the patch when no row exists', () => {
		expect(mergeCalendarSettings(null, { defaultView: 'monthView' })).toEqual({
			weekStart: 'sunday',
			timeZone: 'UTC',
			color: '#3b82f6',
			defaultView: 'monthView',
			defaultCalendarId: null,
			syncEventsToFamilyCalendar: false,
			autoParseEventDetails: true,
			showDailyVerse: false,
			showAdsAsEvents: false
		});
	});

	it('backfills a sparse sign-up row’s nulls from the defaults (Q-108 is post-S6)', () => {
		expect(mergeCalendarSettings(SPARSE, { timeZone: 'America/Denver' })).toEqual({
			weekStart: 'sunday',
			timeZone: 'America/Denver',
			color: '#3b82f6',
			defaultView: 'dayView',
			defaultCalendarId: null,
			syncEventsToFamilyCalendar: false,
			autoParseEventDetails: true,
			showDailyVerse: false,
			showAdsAsEvents: false
		});
	});

	it('lets a null in the patch clear a stored default calendar', () => {
		expect(mergeCalendarSettings(STORED, { defaultCalendarId: null }).defaultCalendarId).toBeNull();
	});
});

describe('defaultCalendarToCheck', () => {
	// Only a default calendar THIS patch sets is re-checked (settings/+server.ts:116-121),
	// and only when it is truthy (accountData.ts:167).
	it.each<[string, CalendarSettingsPatch, string | null]>([
		['a patch without the key', { timeZone: 'Asia/Tokyo' }, null],
		['a patch clearing it', { defaultCalendarId: null }, null],
		['a patch setting one', { defaultCalendarId: 'cal-mine-two' }, 'cal-mine-two']
	])('%s → %j', (_label, patch, expected) => {
		expect(defaultCalendarToCheck(patch)).toBe(expected);
	});
});

describe('calendarSettingsView', () => {
	it('answers the page defaults when there is no row', () => {
		expect(calendarSettingsView(null)).toEqual(ACCOUNT_SETTINGS_DEFAULTS);
	});

	it('answers every stored column except verseTranslation', () => {
		const { verseTranslation: _stripped, ...expected } = STORED;
		void _stripped;
		const view = calendarSettingsView(STORED);
		expect(view).toEqual(expected);
		expect(Object.keys(view)).not.toContain('verseTranslation');
	});

	it('answers a sparse row’s nulls as stored', () => {
		const view = calendarSettingsView(SPARSE);
		expect(view).toMatchObject({ color: null, syncEventsToFamilyCalendar: null });
	});
});

describe('writableSettings', () => {
	it('keeps the legacy allowlist (#168, userSettings.ts:8-20)', () => {
		expect(SETTINGS_WRITABLE_FIELDS).toEqual([
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
		]);
	});

	// userSettings.test.ts:27-45.
	it('keeps writable settings keys, including explicit nulls', () => {
		expect(
			writableSettings({
				timeZone: 'Europe/Berlin',
				weekStart: 'monday',
				defaultCalendarId: null,
				hiddenDashboardModules: ['board']
			})
		).toEqual({
			timeZone: 'Europe/Berlin',
			weekStart: 'monday',
			defaultCalendarId: null,
			hiddenDashboardModules: ['board']
		});
	});

	// userSettings.test.ts:47-60, plus the read-only AI flags (Q-014).
	it('keeps only writable settings keys: drops row-key, system and read-only fields', () => {
		const handed: Partial<StoredCalendarSettings> = {
			timeZone: 'UTC',
			id: 'settings-9',
			userId: 'rekeyed-victim',
			updatedAt: new Date(0),
			useCloudAI: false,
			useLocalAI: false
		};
		expect(writableSettings(handed)).toEqual({ timeZone: 'UTC' });
	});

	it('drops undefined values, so an absent showDailyVerse leaves the stored one alone', () => {
		expect(writableSettings({ showDailyVerse: undefined, color: '#00ff00' })).toEqual({
			color: '#00ff00'
		});
	});
});
