/**
 * alerts preference rules: the Notifications card as data. Four switches in a
 * fixed order, each with a label, a hint and a default; the parse of the stored
 * bag; the one-switch write that must not cost the billing half of the row; and
 * the receipt wording.
 *
 * The switches are declared once, as `PREFERENCE_COPY` keyed by id, so the card
 * renders the list, the GET answers it and the save reads the same words: an id
 * added to `ALERT_PREFERENCE_IDS` without copy does not compile.
 *
 * Storage is `activeSubscriptions.notificationMethods`, a jsonb column that is
 * not a preferences table: it also carries the billing half (`email`, `sms`),
 * which predates the card and which `withPreference` therefore copies through
 * untouched. Preferences live under the sibling `preferences` key, so a row
 * written before the card existed still reads back as the approved defaults.
 *
 * Nothing here reads the clock, the environment or the database.
 *
 * Doc: ./README.md#invariants
 */
import { z } from '$lib/kernel/validation/validators';
import type {
	AlertNotificationMethods,
	AlertPreferenceId,
	AlertPreferenceOption,
	AlertPreferences
} from './alerts.contract';

/** The four ids, in the approved page's order. */
export const ALERT_PREFERENCE_IDS = [
	'taskAssigned',
	'taskCompleted',
	'familyJoined',
	'aiSuggestions'
] as const;

type PreferenceCopy = {
	readonly label: string;
	/** The channels this switch covers, in the approved page's wording. */
	readonly hint: string;
	/** What an account that has never opened the card shows. */
	readonly default: boolean;
};

const PREFERENCE_COPY: Record<AlertPreferenceId, PreferenceCopy> = {
	taskAssigned: { label: 'Task assigned to me', hint: 'In-app and push', default: true },
	taskCompleted: { label: 'Task completed', hint: 'In-app and push', default: true },
	// The only opt-in: an existing account has not been told it may announce a
	// new member, so this starts off rather than on.
	familyJoined: { label: 'Someone joined the family', hint: 'In-app only', default: false },
	aiSuggestions: { label: 'AI event suggestions', hint: 'Uses your AI allowance', default: true }
};

/** The four switches as the card lists them and `GET /api/me/notification-preferences` answers them. */
export const ALERT_PREFERENCES: readonly AlertPreferenceOption[] = ALERT_PREFERENCE_IDS.map(
	(id) => ({ id, ...PREFERENCE_COPY[id] })
);

/** What an untouched account shows, and what a first toggle writes for the three it did not touch. */
export const DEFAULT_ALERT_PREFERENCES: AlertPreferences = {
	taskAssigned: PREFERENCE_COPY.taskAssigned.default,
	taskCompleted: PREFERENCE_COPY.taskCompleted.default,
	familyJoined: PREFERENCE_COPY.familyJoined.default,
	aiSuggestions: PREFERENCE_COPY.aiSuggestions.default
};

// The functions below ARE the boundary parser: a jsonb column has no declared
// row shape, so they take `unknown` and decide what a stored row means. Zod
// does the shape tests so no `typeof` ladder is needed.

const PLAIN_OBJECT = z.record(z.string(), z.unknown());

/** The value as a plain object (an array is not one), or null. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type -- boundary parser for an untyped jsonb value.
function plainObject(value: unknown): Record<string, unknown> | null {
	const parsed = PLAIN_OBJECT.safeParse(value);
	return parsed.success ? parsed.data : null;
}

/** A stored value counts only if it is a real boolean: `'yes'` or `1` must never read as "on". */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- boundary parser for an untyped jsonb value.
function booleanOr(value: unknown, fallback: boolean): boolean {
	const parsed = z.boolean().safeParse(value);
	return parsed.success ? parsed.data : fallback;
}

/**
 * The stored row as the four switches should render. Nothing here writes: a
 * missing key, a partial bag or a bag that is not an object all read as the
 * approved default for the keys they do not answer, so the first toggle, not
 * the first page view, is what persists a preference. An unknown saved key is
 * ignored.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- boundary parser for an untyped jsonb value.
export function preferencesFrom(stored: unknown): AlertPreferences {
	const bag = plainObject(plainObject(stored)?.preferences) ?? {};
	return {
		taskAssigned: booleanOr(bag.taskAssigned, DEFAULT_ALERT_PREFERENCES.taskAssigned),
		taskCompleted: booleanOr(bag.taskCompleted, DEFAULT_ALERT_PREFERENCES.taskCompleted),
		familyJoined: booleanOr(bag.familyJoined, DEFAULT_ALERT_PREFERENCES.familyJoined),
		aiSuggestions: booleanOr(bag.aiSuggestions, DEFAULT_ALERT_PREFERENCES.aiSuggestions)
	};
}

/**
 * The stored row with one switch changed. Every other key in the column is
 * carried through by the spread, which is what keeps the billing half (and
 * anything added to the column later) readable after a save; `email` and `sms`
 * fall back to `false` when the row has no real boolean there, never to a
 * guessed `true`. The input is never mutated.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- boundary parser for an untyped jsonb value.
export function withPreference(
	stored: unknown,
	id: AlertPreferenceId,
	value: boolean
): AlertNotificationMethods {
	const base = plainObject(stored) ?? {};
	return {
		...base,
		email: booleanOr(base.email, false),
		sms: booleanOr(base.sms, false),
		preferences: { ...preferencesFrom(stored), [id]: value }
	};
}

/** The receipt wording: what changed, in the switch's own words. */
export function preferenceChangeLabel(id: AlertPreferenceId, value: boolean): string {
	return `${PREFERENCE_COPY[id].label} alerts are ${value ? 'on' : 'off'}.`;
}

/** What the card shows once a save answers: the switches, the message, its tone. */
export type AlertSaveOutcome = {
	readonly preferences: AlertPreferences;
	readonly status: string;
	readonly isError: boolean;
};

/**
 * What the card should show once a save answers. The part worth a rule is the
 * promise about failure: a switch that flipped optimistically and whose save
 * failed goes back where the server still has it, and says so.
 *
 * The revert is `!intent.value`, which is only the server's value while
 * `current` is exactly the optimistic flip; the state class that owns the card
 * (S7) keeps the server value itself and does not lean on that.
 */
export function saveOutcome(
	current: AlertPreferences,
	intent: { readonly id: AlertPreferenceId; readonly value: boolean },
	ok: boolean
): AlertSaveOutcome {
	if (ok) {
		return {
			preferences: { ...current, [intent.id]: intent.value },
			status: preferenceChangeLabel(intent.id, intent.value),
			isError: false
		};
	}
	return {
		preferences: { ...current, [intent.id]: !intent.value },
		status: `${PREFERENCE_COPY[intent.id].label} didn’t save — try again.`,
		isError: true
	};
}
