/**
 * The account page's Notifications card, as data.
 *
 * The approved page shows four switches, in a fixed order, each with a label, a
 * hint and a default. Declared here once so the card renders the list and the
 * save reads the same list — a fifth type added here appears in both, and one
 * added only in the card would persist a key nothing can read back.
 *
 * Storage is `activeSubscriptions.notificationMethods`, a `jsonb` column. That
 * column is not a preferences table: it also carries the billing half
 * (`email`, `sms`), which predates this card and which `withNotificationPreference`
 * therefore copies through untouched. Preferences live under the sibling
 * `preferences` key, so a row written before this card existed — or by any code
 * that only knows the billing shape — still reads back as the approved defaults.
 *
 * The approved page's own note (prototypes/app-ui/account.html:135-137) says this
 * column has no migration path when a sixth type is added: a sixth key in the bag
 * needs no DDL, but a sixth *kind of storage* would.
 */

export type NotificationPreferenceId =
	| 'taskAssigned'
	| 'taskCompleted'
	| 'familyJoined'
	| 'aiSuggestions';

export interface NotificationPreference {
	id: NotificationPreferenceId;
	label: string;
	/** The channels this row covers, in the approved page's wording. */
	hint: string;
	/** What an account that has never opened this card shows. */
	default: boolean;
}

/** The four approved ids, in the approved page's order. */
export const NOTIFICATION_PREFERENCES: readonly NotificationPreference[] = [
	{
		id: 'taskAssigned',
		label: 'Task assigned to me',
		hint: 'In-app and push',
		default: true
	},
	{ id: 'taskCompleted', label: 'Task completed', hint: 'In-app and push', default: true },
	{
		id: 'familyJoined',
		label: 'Someone joined the family',
		hint: 'In-app only',
		// The only opt-in: an existing account has not been told it may announce
		// a new member, so this starts off rather than on.
		default: false
	},
	{
		id: 'aiSuggestions',
		label: 'AI event suggestions',
		hint: 'Uses your AI allowance',
		default: true
	}
];

/** The four booleans, by id — the shape the card reads and the save writes. */
export interface NotificationPreferences {
	taskAssigned: boolean;
	taskCompleted: boolean;
	familyJoined: boolean;
	aiSuggestions: boolean;
}

/**
 * What an untouched account shows — and what is written only on a first toggle.
 *
 * Spelled out rather than derived from the list above, and the two are asserted
 * to agree in the test file: an id added to one and not the other fails there
 * with a message naming the row, which beats a switch that renders `undefined`.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
	taskAssigned: true,
	taskCompleted: true,
	familyJoined: false,
	aiSuggestions: true
};

/**
 * The column's two halves.
 *
 * `email`/`sms` are the billing half that was there first and are never
 * rewritten by this card. `preferences` is optional because every row written
 * before this card existed has no such key — including the row on the live
 * database, which is `{ email: true, sms: false }`.
 */
export interface StoredNotificationMethods {
	email: boolean;
	sms: boolean;
	preferences?: NotificationPreferences;
}

/** Is this a key this card knows how to read and write? */
export function isNotificationPreferenceId(value: unknown): value is NotificationPreferenceId {
	return NOTIFICATION_PREFERENCES.some(({ id }) => id === value);
}

/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type -- this whole region IS the boundary parser: a `jsonb` column has no declared row shape, so `notificationMethodsFrom` and `withNotificationPreference` take `unknown` and decide what a stored row means. The same pattern as icsImportPreview.coerceDrafts. */

/** A plain JSON object — the only shape a `jsonb` value can usefully carry. */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The stored row as the four switches should render.
 *
 * Nothing here writes: a missing key, a partial bag, or a bag that is not an
 * object all read as the approved default for the keys they do not answer, so
 * the first toggle — not the first page view — is what persists a preference.
 *
 * Only real booleans count. A stored `'yes'` or `1` is a row this card cannot
 * interpret, and reading it as "on" would silently enable alerts the account
 * never asked for.
 */
export function notificationPreferencesFrom(stored: unknown): NotificationPreferences {
	const bag = isRecord(stored) && isRecord(stored.preferences) ? stored.preferences : {};
	// Named key by key: a `Record` cast here would compile while silently
	// answering `undefined` for a fifth id added to the list above.
	return {
		taskAssigned: readStored(bag.taskAssigned, true),
		taskCompleted: readStored(bag.taskCompleted, true),
		familyJoined: readStored(bag.familyJoined, false),
		aiSuggestions: readStored(bag.aiSuggestions, true)
	};
}

/** A stored value counts only if it is a real boolean. */
function readStored(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

/**
 * The stored row with one preference changed.
 *
 * Every other key in the column is carried through by the spread — that is what
 * keeps the billing half, and anything added to the column later, readable
 * after a save. The input is never mutated.
 */
export function withNotificationPreference(
	stored: unknown,
	id: NotificationPreferenceId,
	value: boolean
): StoredNotificationMethods {
	// SAFETY: `isRecord` proved `stored` is a plain object, so it is safe to
	// spread — and every key this function promises to return is set explicitly
	// below rather than read off the spread.
	const base: Partial<StoredNotificationMethods> = isRecord(stored)
		? (stored as Partial<StoredNotificationMethods>)
		: {};
	return {
		...base,
		email: typeof base.email === 'boolean' ? base.email : false,
		sms: typeof base.sms === 'boolean' ? base.sms : false,
		preferences: { ...notificationPreferencesFrom(stored), [id]: value }
	};
}

/** The receipt wording: what changed, in the row's own words. */
export function notificationPreferenceChangeLabel(
	id: NotificationPreferenceId,
	value: boolean
): string {
	return `${labelFor(id)} alerts are ${value ? 'on' : 'off'}.`;
}

/** This row's approved label, by id. */
function labelFor(id: NotificationPreferenceId): string {
	return NOTIFICATION_PREFERENCES.find((p) => p.id === id)?.label ?? id;
}

/** What the card shows once a save answers: the switches, the receipt, its tone. */
export interface NotificationSaveOutcome {
	preferences: NotificationPreferences;
	status: string;
	isError: boolean;
}

/**
 * What the card should show once a save answers.
 *
 * Pure, because the part worth testing is a promise about failure: a switch that
 * flipped optimistically and whose save failed must go back to where the server
 * still has it, and must say so. A flipped switch that outlives a failed save is
 * a lie the user cannot see through.
 */
export function notificationSaveOutcome(
	current: NotificationPreferences,
	intent: { id: NotificationPreferenceId; value: boolean },
	ok: boolean
): NotificationSaveOutcome {
	if (ok) {
		return {
			preferences: { ...current, [intent.id]: intent.value },
			status: notificationPreferenceChangeLabel(intent.id, intent.value),
			isError: false
		};
	}
	return {
		preferences: { ...current, [intent.id]: !intent.value },
		status: `${labelFor(intent.id)} didn’t save — try again.`,
		isError: true
	};
}

/* oxlint-enable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type */