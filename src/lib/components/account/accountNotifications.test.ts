import { describe, it, expect } from 'vitest';
import {
	NOTIFICATION_PREFERENCES,
	DEFAULT_NOTIFICATION_PREFERENCES,
	isNotificationPreferenceId,
	notificationPreferenceChangeLabel,
	notificationPreferencesFrom,
	notificationSaveOutcome,
	withNotificationPreference
} from './accountNotifications';

/**
 * The approved page's Notifications card, as data.
 *
 * The four rows are an approved list, not a set: order, wording and defaults
 * are all pinned here, because the card renders them positionally and a
 * reordering that is invisible in a diff is visible to every user.
 */

/** The one row the live database carries in the legacy billing shape. */
const LEGACY_ROW = { email: true, sms: false };

describe('NOTIFICATION_PREFERENCES — the approved four', () => {
	it('lists them in the approved page order', () => {
		expect(NOTIFICATION_PREFERENCES.map((p) => p.label)).toEqual([
			'Task assigned to me',
			'Task completed',
			'Someone joined the family',
			'AI event suggestions'
		]);
	});

	it('keeps the approved hint on each row', () => {
		expect(NOTIFICATION_PREFERENCES.map((p) => p.hint)).toEqual([
			'In-app and push',
			'In-app and push',
			'In-app only',
			'Uses your AI allowance'
		]);
	});

	it('defaults to on, on, off, on — "Someone joined the family" is the only opt-in', () => {
		expect(NOTIFICATION_PREFERENCES.map((p) => p.default)).toEqual([true, true, false, true]);
		expect(DEFAULT_NOTIFICATION_PREFERENCES).toEqual({
			taskAssigned: true,
			taskCompleted: true,
			familyJoined: false,
			aiSuggestions: true
		});
	});

	// The two spellings of the same fact, kept honest against each other: the
	// `default` on each row drives the UI, DEFAULT_… drives the missing-value
	// path, and an id added to one but not the other shows up here by name.
	it('names exactly the ids the defaults object has, with the same values', () => {
		for (const { id, default: on } of NOTIFICATION_PREFERENCES) {
			expect(DEFAULT_NOTIFICATION_PREFERENCES[id], `default for "${id}"`).toBe(on);
		}
		expect(Object.keys(DEFAULT_NOTIFICATION_PREFERENCES).sort()).toEqual(
			NOTIFICATION_PREFERENCES.map((p) => p.id).sort()
		);
	});
});

describe('isNotificationPreferenceId', () => {
	it('accepts every canonical id', () => {
		for (const { id } of NOTIFICATION_PREFERENCES) {
			expect(isNotificationPreferenceId(id)).toBe(true);
		}
	});

	it('rejects anything else, so a posted key cannot invent a fifth switch', () => {
		expect(isNotificationPreferenceId('meals')).toBe(false);
		expect(isNotificationPreferenceId('')).toBe(false);
		expect(isNotificationPreferenceId('TaskAssigned')).toBe(false);
	});
});

describe('notificationPreferencesFrom — what a never-touched user sees', () => {
	it('shows the approved defaults for a legacy billing-shaped row', () => {
		// The row on the live database today: `{ email, sms }`, no preferences
		// key. Reading it must not throw and must not blank the card.
		expect(notificationPreferencesFrom(LEGACY_ROW)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
	});

	it('shows the approved defaults when there is nothing stored at all', () => {
		expect(notificationPreferencesFrom(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
		expect(notificationPreferencesFrom(undefined)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
	});

	it('reads a saved bag, and defaults only the keys it is missing', () => {
		expect(
			notificationPreferencesFrom({ ...LEGACY_ROW, preferences: { familyJoined: true } })
		).toEqual({ ...DEFAULT_NOTIFICATION_PREFERENCES, familyJoined: true });
	});

	it('refuses a non-boolean value rather than rendering it as "on"', () => {
		// A hand-edited row, or a future string-valued shape, must not read as
		// a truthy switch.
		expect(
			notificationPreferencesFrom({ preferences: { aiSuggestions: 'yes', familyJoined: 1 } })
		).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
		expect(notificationPreferencesFrom({ preferences: 'nope' })).toEqual(
			DEFAULT_NOTIFICATION_PREFERENCES
		);
	});

	it('ignores an unknown saved key rather than carrying it into the card', () => {
		expect(notificationPreferencesFrom({ preferences: { meals: true } })).toEqual(
			DEFAULT_NOTIFICATION_PREFERENCES
		);
	});
});

describe('withNotificationPreference — the write must not cost the billing shape', () => {
	it('keeps email and sms byte-identical and adds only the preferences bag', () => {
		const written = withNotificationPreference(LEGACY_ROW, 'familyJoined', true);
		expect(written.email).toBe(true);
		expect(written.sms).toBe(false);
		expect(written.preferences).toEqual({ ...DEFAULT_NOTIFICATION_PREFERENCES, familyJoined: true });
	});

	it('survives a full round trip: legacy row in, legacy row still readable out', () => {
		// The promise the live row depends on: writing a preference must not
		// reshape the billing half, so code that reads `{ email, sms }` keeps
		// working and a second write still sees the original values.
		const once = withNotificationPreference(LEGACY_ROW, 'aiSuggestions', false);
		const twice = withNotificationPreference(once, 'taskAssigned', false);
		expect(twice).toMatchObject({ email: true, sms: false });
		expect(notificationPreferencesFrom(twice)).toEqual({
			taskAssigned: false,
			taskCompleted: true,
			familyJoined: false,
			aiSuggestions: false
		});
	});

	it('leaves a key it was not asked about alone', () => {
		const stored = { email: false, sms: false, preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, familyJoined: true } };
		const written = withNotificationPreference(stored, 'taskCompleted', false);
		expect(written.preferences).toEqual({
			taskAssigned: true,
			taskCompleted: false,
			familyJoined: true,
			aiSuggestions: true
		});
	});

	it('builds the whole bag from an absent or malformed row', () => {
		expect(withNotificationPreference(undefined, 'aiSuggestions', false).preferences).toEqual({
			...DEFAULT_NOTIFICATION_PREFERENCES,
			aiSuggestions: false
		});
		expect(withNotificationPreference({ preferences: 7 }, 'taskAssigned', false).preferences).toEqual(
			{ ...DEFAULT_NOTIFICATION_PREFERENCES, taskAssigned: false }
		);
	});

	it('does not mutate the row it was handed', () => {
		const stored = { ...LEGACY_ROW };
		withNotificationPreference(stored, 'familyJoined', true);
		expect(stored).toEqual(LEGACY_ROW);
	});
});

describe('notificationPreferenceChangeLabel — the receipt names the row', () => {
	it('says which switch changed and which way', () => {
		expect(notificationPreferenceChangeLabel('familyJoined', true)).toBe(
			'Someone joined the family alerts are on.'
		);
		expect(notificationPreferenceChangeLabel('taskAssigned', false)).toBe(
			'Task assigned to me alerts are off.'
		);
	});
});

describe('notificationSaveOutcome — a failed save must not leave the switch lying', () => {
	const intent = { id: 'taskCompleted', value: false } as const;

	it('keeps the optimistic flip when the save succeeds', () => {
		const outcome = notificationSaveOutcome(DEFAULT_NOTIFICATION_PREFERENCES, intent, true);
		expect(outcome.preferences).toEqual({ ...DEFAULT_NOTIFICATION_PREFERENCES, taskCompleted: false });
		expect(outcome.isError).toBe(false);
		expect(outcome.status).toContain('Task completed');
	});

	it('puts the switch back where the server still has it when the save fails', () => {
		const flipped = { ...DEFAULT_NOTIFICATION_PREFERENCES, taskCompleted: false };
		const outcome = notificationSaveOutcome(flipped, intent, false);
		expect(outcome.preferences).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
		expect(outcome.isError).toBe(true);
		expect(outcome.status).toMatch(/didn’t save/);
		expect(outcome.status).toContain('Task completed');
	});

	it('leaves the other three switches alone either way', () => {
		const saved = notificationPreferencesFrom({
			preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, familyJoined: true, aiSuggestions: false }
		});
		for (const ok of [true, false]) {
			const outcome = notificationSaveOutcome(saved, intent, ok);
			expect(outcome.preferences.familyJoined).toBe(true);
			expect(outcome.preferences.aiSuggestions).toBe(false);
			expect(outcome.preferences.taskAssigned).toBe(true);
		}
	});
});