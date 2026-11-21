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
	isIanaTimeZone,
	newCalendarSettings,
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

describe('isIanaTimeZone', () => {
	// Q-107 B: IANA names plus UTC. Expected values from the owner answer and
	// ICU's tz database (the pseudo-zones Luxon accepted are refused).
	it.each<[string, boolean]>([
		['UTC', true],
		['utc', true],
		['America/Chicago', true],
		['Asia/Tokyo', true],
		['US/Central', true],
		['Etc/GMT+5', true],
		['gmt', true],
		['local', false],
		['system', false],
		['default', false],
		['UTC+5', false],
		['utc+5', false],
		['+05:00', false],
		['', false],
		['Mars/Base', false],
		['Not/AZone', false]
	])('%j → %s', (zone, expected) => {
		expect(isIanaTimeZone(zone)).toBe(expected);
	});
});

describe('calendarSettingsPatch', () => {
	it.each<[string, unknown, CalendarSettingsPatch]>([
		['an empty object is an empty patch', {}, {}],
		['timeZone alone', { timeZone: 'Asia/Tokyo' }, { timeZone: 'Asia/Tokyo' }],
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
		// Q-107 B: Luxon's pseudo-zones and fixed offsets are refused now.
		['a server-relative zone', { timeZone: 'local' }, 'Invalid timeZone'],
		['the system zone alias', { timeZone: 'system' }, 'Invalid timeZone'],
		['the default zone alias', { timeZone: 'default' }, 'Invalid timeZone'],
		['a fixed-offset zone', { timeZone: 'UTC+5' }, 'Invalid timeZone'],
		['a bare offset', { timeZone: '+05:00' }, 'Invalid timeZone'],
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

describe('newCalendarSettings', () => {
	it('builds from the page defaults plus the patch when no row exists', () => {
		expect(newCalendarSettings({ defaultView: 'monthView' })).toEqual({
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

	it('lets a null in the patch clear the default calendar (already the default)', () => {
		expect(newCalendarSettings({ defaultCalendarId: null }).defaultCalendarId).toBeNull();
	});

	it('keeps every field the patch sends', () => {
		expect(
			newCalendarSettings({
				weekStart: 'monday',
				timeZone: 'Asia/Tokyo',
				color: '#00ff00',
				showAdsAsEvents: true
			})
		).toMatchObject({
			weekStart: 'monday',
			timeZone: 'Asia/Tokyo',
			color: '#00ff00',
			showAdsAsEvents: true
		});
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

	it('answers a sparse row’s null page columns as the defaults (Q-108 B)', () => {
		const view = calendarSettingsView(SPARSE);
		expect(view).toMatchObject({ color: '#3b82f6', syncEventsToFamilyCalendar: false });
		expect(view).toEqual({
			id: 'settings-a',
			userId: 'u1',
			weekStart: 'sunday',
			timeZone: 'UTC',
			color: '#3b82f6',
			defaultView: 'dayView',
			defaultCalendarId: null,
			syncEventsToFamilyCalendar: false,
			autoParseEventDetails: true,
			showDailyVerse: false,
			showAdsAsEvents: false,
			hiddenDashboardModules: null,
			useCloudAI: true,
			useLocalAI: true,
			updatedAt: new Date('2026-10-07T13:00:00.000Z')
		});
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
