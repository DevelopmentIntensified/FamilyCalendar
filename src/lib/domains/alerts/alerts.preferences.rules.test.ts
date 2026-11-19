/**
 * Pure rules for the four notification switches: order, copy and defaults, the
 * stored-bag parse (real booleans only), the one-switch write that must not
 * cost the billing half, the receipt wording and the save outcome. Carried over
 * from `src/lib/components/account/accountNotifications.test.ts` (cases named
 * inline); the golden `GET`/`PUT /api/me/notification-preferences` pins the
 * same copy on the wire.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import type { AlertPreferenceId, AlertPreferences } from './alerts.contract';
import {
	ALERT_PREFERENCE_IDS,
	ALERT_PREFERENCES,
	DEFAULT_ALERT_PREFERENCES,
	preferenceChangeLabel,
	preferencesFrom,
	saveOutcome,
	withPreference
} from './alerts.preferences.rules';

/** The row on the live database today: the billing half only, no preferences key. */
const LEGACY_ROW = { email: true, sms: false };

describe('the approved four', () => {
	// accountNotifications.test.ts:24 "lists them in the approved page order"
	it('lists them in the approved page order', () => {
		expect(ALERT_PREFERENCE_IDS).toEqual([
			'taskAssigned',
			'taskCompleted',
			'familyJoined',
			'aiSuggestions'
		]);
		expect(ALERT_PREFERENCES.map((option) => option.id)).toEqual([...ALERT_PREFERENCE_IDS]);
		expect(ALERT_PREFERENCES.map((option) => option.label)).toEqual([
			'Task assigned to me',
			'Task completed',
			'Someone joined the family',
			'AI event suggestions'
		]);
	});

	// accountNotifications.test.ts:33 "keeps the approved hint on each row"
	it('keeps the approved hint on each row', () => {
		expect(ALERT_PREFERENCES.map((option) => option.hint)).toEqual([
			'In-app and push',
			'In-app and push',
			'In-app only',
			'Uses your AI allowance'
		]);
	});

	// accountNotifications.test.ts:42 "defaults to on, on, off, on" (README: keeps the approved order and the one off-by-default)
	it('defaults to on, on, off, on: "Someone joined the family" is the only opt-in', () => {
		expect(ALERT_PREFERENCES.map((option) => option.default)).toEqual([true, true, false, true]);
		expect(DEFAULT_ALERT_PREFERENCES).toEqual({
			taskAssigned: true,
			taskCompleted: true,
			familyJoined: false,
			aiSuggestions: true
		});
	});

	// accountNotifications.test.ts:55 "names exactly the ids the defaults object has, with the same values"
	it('names exactly the ids the defaults object has, with the same values', () => {
		for (const { id, default: on } of ALERT_PREFERENCES) {
			expect(DEFAULT_ALERT_PREFERENCES[id], `default for "${id}"`).toBe(on);
		}
		expect(Object.keys(DEFAULT_ALERT_PREFERENCES).sort()).toEqual(
			ALERT_PREFERENCES.map((option) => option.id).sort()
		);
	});
});

describe('preferencesFrom: what a never-touched user sees', () => {
	// accountNotifications.test.ts:80,86 "shows the approved defaults for a legacy billing-shaped row", "… when there is nothing stored at all"
	it.each<[string, unknown]>([
		['a legacy billing-shaped row', LEGACY_ROW],
		['null', null],
		['undefined', undefined],
		['a string', 'on'],
		['an array', []],
		['an empty bag', { preferences: {} }],
		['an unknown saved key', { preferences: { meals: true } }],
		// accountNotifications.test.ts:97 "refuses a non-boolean value rather than rendering it as on"
		['non-boolean values', { preferences: { aiSuggestions: 'yes', familyJoined: 1 } }],
		['a bag that is a string', { preferences: 'nope' }],
		['a bag that is an array', { preferences: [true, true, true, true] }],
		['a null bag', { preferences: null }]
	])('shows the approved defaults for %s', (_label, stored) => {
		expect(preferencesFrom(stored)).toEqual(DEFAULT_ALERT_PREFERENCES);
	});

	// accountNotifications.test.ts:91 "reads a saved bag, and defaults only the keys it is missing"
	it('reads a saved bag, and defaults only the keys it is missing', () => {
		expect(preferencesFrom({ ...LEGACY_ROW, preferences: { familyJoined: true } })).toEqual({
			...DEFAULT_ALERT_PREFERENCES,
			familyJoined: true
		});
	});

	it('reads every real boolean it finds, false included', () => {
		expect(
			preferencesFrom({
				preferences: {
					taskAssigned: false,
					taskCompleted: false,
					familyJoined: true,
					aiSuggestions: false
				}
			})
		).toEqual({
			taskAssigned: false,
			taskCompleted: false,
			familyJoined: true,
			aiSuggestions: false
		});
	});

	it('defaults only the key that holds a non-boolean, keeping a real boolean beside it', () => {
		expect(preferencesFrom({ preferences: { taskAssigned: false, taskCompleted: 'no' } })).toEqual({
			...DEFAULT_ALERT_PREFERENCES,
			taskAssigned: false
		});
	});
});

describe('withPreference: the write must not cost the billing shape', () => {
	// accountNotifications.test.ts:116 "keeps email and sms byte-identical and adds only the preferences bag"
	it('keeps email and sms and adds only the preferences bag', () => {
		expect(withPreference(LEGACY_ROW, 'familyJoined', true)).toEqual({
			email: true,
			sms: false,
			preferences: { ...DEFAULT_ALERT_PREFERENCES, familyJoined: true }
		});
	});

	// accountNotifications.test.ts:123 "survives a full round trip: legacy row in, legacy row still readable out"
	it('survives a full round trip: legacy row in, legacy row still readable out', () => {
		const once = withPreference(LEGACY_ROW, 'aiSuggestions', false);
		const twice = withPreference(once, 'taskAssigned', false);
		expect(twice).toMatchObject({ email: true, sms: false });
		expect(preferencesFrom(twice)).toEqual({
			taskAssigned: false,
			taskCompleted: true,
			familyJoined: false,
			aiSuggestions: false
		});
	});

	// accountNotifications.test.ts:138 "leaves a key it was not asked about alone"
	it('leaves a key it was not asked about alone', () => {
		const stored = {
			email: false,
			sms: false,
			preferences: { ...DEFAULT_ALERT_PREFERENCES, familyJoined: true }
		};
		expect(withPreference(stored, 'taskCompleted', false).preferences).toEqual({
			taskAssigned: true,
			taskCompleted: false,
			familyJoined: true,
			aiSuggestions: true
		});
	});

	// accountNotifications.test.ts:149 "builds the whole bag from an absent or malformed row"
	it.each<[string, unknown, AlertPreferenceId, AlertPreferences]>([
		[
			'an absent row',
			undefined,
			'aiSuggestions',
			{ ...DEFAULT_ALERT_PREFERENCES, aiSuggestions: false }
		],
		[
			'a bag that is a number',
			{ preferences: 7 },
			'taskAssigned',
			{ ...DEFAULT_ALERT_PREFERENCES, taskAssigned: false }
		]
	])('builds the whole bag from %s', (_label, stored, id, expected) => {
		expect(withPreference(stored, id, false).preferences).toEqual(expected);
	});

	it.each<[string, unknown]>([
		['an absent row', undefined],
		['a row with no billing half', {}],
		['a row whose email and sms are not booleans', { email: 'yes', sms: 1 }]
	])('writes email and sms as false for %s, never a guessed true', (_label, stored) => {
		expect(withPreference(stored, 'taskAssigned', true)).toMatchObject({ email: false, sms: false });
	});

	it('carries any other key the column has through untouched', () => {
		const written = withPreference({ ...LEGACY_ROW, quietHours: { from: 22 } }, 'familyJoined', true);
		expect(written).toMatchObject({ quietHours: { from: 22 }, email: true, sms: false });
	});

	// accountNotifications.test.ts:159 "does not mutate the row it was handed"
	it('does not mutate the row it was handed', () => {
		const stored = { ...LEGACY_ROW };
		withPreference(stored, 'familyJoined', true);
		expect(stored).toEqual(LEGACY_ROW);
	});
});

describe('preferenceChangeLabel: the receipt names the row', () => {
	// accountNotifications.test.ts:167 "says which switch changed and which way"
	it.each<[AlertPreferenceId, boolean, string]>([
		['familyJoined', true, 'Someone joined the family alerts are on.'],
		['taskAssigned', false, 'Task assigned to me alerts are off.'],
		['taskCompleted', true, 'Task completed alerts are on.'],
		['aiSuggestions', false, 'AI event suggestions alerts are off.']
	])('%s %s reads %j', (id, value, label) => {
		expect(preferenceChangeLabel(id, value)).toBe(label);
	});
});

describe('saveOutcome: a failed save must not leave the switch lying', () => {
	const intent = { id: 'taskCompleted', value: false } as const;

	// accountNotifications.test.ts:180 "keeps the optimistic flip when the save succeeds"
	it('keeps the optimistic flip when the save succeeds', () => {
		const outcome = saveOutcome(DEFAULT_ALERT_PREFERENCES, intent, true);
		expect(outcome).toEqual({
			preferences: { ...DEFAULT_ALERT_PREFERENCES, taskCompleted: false },
			status: 'Task completed alerts are off.',
			isError: false
		});
	});

	// accountNotifications.test.ts:187 "puts the switch back where the server still has it when the save fails"
	it('puts the switch back where the server still has it when the save fails', () => {
		const flipped = { ...DEFAULT_ALERT_PREFERENCES, taskCompleted: false };
		expect(saveOutcome(flipped, intent, false)).toEqual({
			preferences: DEFAULT_ALERT_PREFERENCES,
			status: 'Task completed didn’t save — try again.',
			isError: true
		});
	});

	// accountNotifications.test.ts:196 "leaves the other three switches alone either way"
	it.each([true, false])('leaves the other three switches alone when ok is %s', (ok) => {
		const saved = preferencesFrom({
			preferences: { ...DEFAULT_ALERT_PREFERENCES, familyJoined: true, aiSuggestions: false }
		});
		const outcome = saveOutcome(saved, intent, ok);
		expect(outcome.preferences.familyJoined).toBe(true);
		expect(outcome.preferences.aiSuggestions).toBe(false);
		expect(outcome.preferences.taskAssigned).toBe(true);
	});
});
