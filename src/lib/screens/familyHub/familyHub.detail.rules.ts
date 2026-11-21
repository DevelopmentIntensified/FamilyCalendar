/**
 * familyHub detail rules: the pure decisions behind `/family/[familyId]`.
 *
 * Four things the page derives rather than reads: whether the name/colour
 * fields are re-seeded from the server, the "Uses" cell of the live invitation,
 * the AI-events bar's width, and one Recent Activity line. Everything is passed
 * in — no clock, no request, no database — so the page, its state class and its
 * tests agree on the same answer.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';

/** The family fields the settings band edits, as the loader supplies them. */
export type FamilySettingsSource = {
	readonly id: string;
	readonly name: string;
	readonly color: string | null;
};

/** The two fields the settings band holds while the admin types. */
export type FamilySettingsFields = {
	readonly name: string;
	readonly color: string;
};

/** What the band holds after a seed decision, plus the key it was seeded from. */
export type FamilySettingsSeed = {
	readonly key: string;
	readonly fields: FamilySettingsFields;
};

/**
 * The server's identity for the settings fields: the family's id, name and
 * colour exactly as sent (a null colour is spelled `null`). Only a change to
 * one of the three re-seeds the inputs.
 */
export function familySettingsKey(family: FamilySettingsSource): string {
	return `${family.id}|${family.name}|${family.color}`;
}

/**
 * Re-seed the name/colour inputs only when the server's `id|name|color`
 * changed. An unrelated reload (activity, a module switch, another member's
 * role) leaves a half-typed name alone; a rename or a different family wins.
 *
 * `fallbackColor` is the palette default the owning `family` module declares —
 * a parameter rather than an import so this screen keeps no second copy of it.
 */
export function seedFamilySettings(
	previousKey: string | null,
	family: FamilySettingsSource,
	current: FamilySettingsFields,
	fallbackColor: string
): FamilySettingsSeed {
	const key = familySettingsKey(family);
	if (key === previousKey) return { key, fields: current };
	return {
		key,
		fields: { name: family.name || '', color: family.color || fallbackColor }
	};
}

/** A live invite as the rail shows it: `maxUses` null is the unlimited code. */
export type InviteUsage = {
	readonly useCount: number;
	readonly maxUses: number | null;
};

/**
 * The "Uses" cell: `"{used} of {max}"`, or `"{used} of ∞"` for a code with no
 * cap. A stored `0` stays `0` (it is a cap, not "unlimited") — the legacy `??`
 * kept the difference, so this does too.
 */
export function inviteUsesLabel(invite: InviteUsage): string {
	return `${invite.useCount} of ${invite.maxUses ?? '∞'}`;
}

/**
 * The width of the Plan band's AI-events bar, in whole percent. A zero (or
 * unknown) limit is an empty bar rather than a division by zero or "∞%"; a
 * used figure above the limit is clamped to a full bar.
 */
export function aiUsagePercent(used: number, limit: number): number {
	return limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
}

/** One Recent Activity row as the tasks activity read supplies it. */
export type ActivityLineItem = {
	readonly kind: 'completed' | 'assigned';
	readonly actorName: string;
	readonly title: string;
	/** The person an `assigned` handoff went to; unused by a completion. */
	readonly targetName?: string | null;
};

/**
 * One Recent Activity line: `✅ {actor} completed '{title}'` or
 * `📋 {actor} assigned '{title}' to {target}`. A handoff with no recorded
 * target keeps the sentence without " to …", exactly as the page rendered it.
 */
export function activityLine(item: ActivityLineItem): string {
	if (item.kind === 'completed') return `✅ ${item.actorName} completed '${item.title}'`;
	const target = item.targetName ? ` to ${item.targetName}` : '';
	return `📋 ${item.actorName} assigned '${item.title}'${target}`;
}

/** The feed's empty state, worded once so the card and its test cannot drift. */
export const ACTIVITY_EMPTY_MESSAGE = 'No activity yet — complete something to get things moving.';

/**
 * The relative time beside an activity line ("2 days ago"), the legacy
 * `relativeTime` (`dateUtils.ts:88-91` = Luxon's `toRelative()`). `now` is
 * passed in (rule R5); an empty or unparsable instant prints nothing.
 *
 * A completion's stamp is the `mode: 'string'` column, which reads back as
 * Postgres text (`2026-02-01 10:00:00+00`) rather than ISO — the legacy call
 * answered `''` for those rows. `fromSQL` parses that form too, so a completed
 * item finally prints its age; an ISO stamp takes the `fromISO` path.
 */
export function activityAgo(at: string, now: Date): string {
	let instant = DateTime.fromISO(at);
	if (!instant.isValid) instant = DateTime.fromSQL(at);
	if (!instant.isValid) return '';
	return instant.toRelative({ base: DateTime.fromJSDate(now) }) ?? '';
}

/**
 * The rail's "Expires" cell: the live code's date in the reader's locale
 * (legacy `inviteExpiry` = `new Date(iso).toLocaleDateString()`); an
 * unparsable instant prints nothing.
 */
export function inviteExpiryLabel(expiresAt: Date | string): string {
	const date = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
	return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}
