/**
 * family home rules: the `/family` list's pure presentation logic. The cards
 * are composed by `family.families.rules.ts` (one card, oldest first); this
 * file is the page's own reading of that payload — the initials the avatars
 * print, the roster strip's cap, the per-family roster and live-code maps the
 * rail walks, and the labels the plan pill and the invite band print.
 *
 * Everything takes its rows as parameters (`now` too, where a code's usability
 * depends on it), so the page is tested with plain tables and the screen keeps
 * no logic of its own. Copy is the approved page's wording, verbatim.
 *
 * Doc: ./README.md#invariants
 */
import type { FamilyActiveInvite, FamilyRosterRowView } from './family.contract';

/** How many avatars the card's roster strip draws before it counts the rest out loud. */
export const FAMILY_ROSTER_STRIP_CAP = 5;

/** The family's initial on its colour; a name with no letters is a letter, never a blank circle. */
export function familyInitial(name: string): string {
	return (name || 'F').charAt(0).toUpperCase();
}

/** "Maya" → "M": the strip and the rail print one letter, as the approved pages do. */
export function familyPersonInitial(firstName: string | null | undefined): string {
	const first = (firstName ?? '').trim();
	return first ? first.charAt(0).toUpperCase() : '•';
}

/** One card member, as the loader composes it (first name plus the id the avatar colours by). */
export type FamilyStripMember = { readonly firstName: string; readonly userId: string };

/** The strip's first five avatars and how many stayed off it. */
export function familyRosterStrip(members: readonly FamilyStripMember[]): {
	readonly shown: FamilyStripMember[];
	readonly hidden: number;
} {
	const shown = members.slice(0, FAMILY_ROSTER_STRIP_CAP);
	return { shown, hidden: members.length - shown.length };
}

/** Roster rows per family, in the order the loader returned them (first-name order). */
export function familyRosterByFamily(
	rows: readonly FamilyRosterRowView[]
): Map<string, FamilyRosterRowView[]> {
	const byFamily = new Map<string, FamilyRosterRowView[]>();
	for (const row of rows) {
		const list = byFamily.get(row.familyId);
		if (list) list.push(row);
		else byFamily.set(row.familyId, [row]);
	}
	return byFamily;
}

/** The join code still in use per family — the loader already filtered the spent ones out. */
export function familyInviteByFamily(
	invites: readonly FamilyActiveInvite[]
): Map<string, FamilyActiveInvite> {
	return new Map(invites.map((invite) => [invite.familyId, invite]));
}

/** "2 of 5 used" — a code with no ceiling prints ∞, never `null`. */
export function familyInviteUsesLabel(invite: {
	readonly useCount: number | null;
	readonly maxUses: number | null;
}): string {
	return `${invite.useCount ?? 0} of ${invite.maxUses ?? '∞'} used`;
}

/** An instant as the rail prints it; an unreadable value prints nothing, not "Invalid Date". */
export function familyExpiryLabel(value: Date | string): string {
	const date = value instanceof Date ? value : new Date(value);
	return isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

/** A rail row's person: both names when present, else the page's placeholder. */
export function familyRailPersonName(row: {
	readonly firstName: string | null;
	readonly lastName: string | null;
}): string {
	return [row.firstName, row.lastName].filter(Boolean).join(' ') || 'Family member';
}

/** The hero's plan pill: "1 of 1 family" / "2 of 5 families" on your plan. */
export function familyPlanLabel(used: number, limit: number): string {
	return `${used} of ${limit} ${limit === 1 ? 'family' : 'families'} on your plan`;
}

/** At the family limit the hero offers an upgrade; below it, the create page. */
export function familyAtPlanLimit(plan: { readonly used: number; readonly limit: number }): boolean {
	return plan.used >= plan.limit;
}
