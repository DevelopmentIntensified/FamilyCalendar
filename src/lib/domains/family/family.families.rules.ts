/**
 * family families rules: creating and renaming a family, the picks that join
 * it on day one, and how a card on the `/family` list is composed.
 *
 * The plan limits (`memberLimit`) come in as parameters: billing owns the
 * numbers, family owns what to do with them.
 *
 * Doc: ./README.md#invariants
 */
import { canManageInvites, type FamilyRefusal } from './family.roles.rules';
import { DEFAULT_FAMILY_COLOR, isFamilyColor } from './family.palette.rules';
import type { FamilyCardView, FamilyMembershipView } from './family.contract';

/** The longest family name, measured on the trimmed name. */
export const FAMILY_NAME_MAX = 50;

/** The one 404 for a family you cannot reach: not a member and no such id are the same answer. */
export const FAMILY_NOT_FOUND_MESSAGE = 'Family not found';

/** The 400 for a picked person who is not a verified account. */
export const UNADDABLE_PICK_MESSAGE =
	'One of the people you picked cannot be added yet — send them an email invite instead.';

/** A family ready to write: the trimmed name and the colour it will carry. */
export type FamilyDraft = {
	readonly name: string;
	readonly color: string;
};

export type FamilyDraftResult =
	| { readonly ok: true; readonly draft: FamilyDraft }
	| { readonly ok: false; readonly refusal: FamilyRefusal };

/**
 * Validate the create form after the plan gate: a name is required (blank is
 * missing) and at most 50 characters trimmed; a colour, when given, must be a
 * palette member (#099), and an empty one means the palette default. Legacy
 * truthiness decides "given": `''` is absent, so an absent and a null colour
 * (both read as `''` at the boundary) mean the same thing.
 */
export function familyDraft(name: string, color: string): FamilyDraftResult {
	const trimmed = name.trim();
	if (trimmed.length === 0) {
		return { ok: false, refusal: { status: 400, message: 'Family name is required' } };
	}
	if (trimmed.length > FAMILY_NAME_MAX) {
		return {
			ok: false,
			refusal: { status: 400, message: 'Family name must be 50 characters or less' }
		};
	}
	if (color && !isFamilyColor(color)) {
		return {
			ok: false,
			refusal: { status: 400, message: 'Pick one of the offered family colours' }
		};
	}
	return { ok: true, draft: { name: trimmed, color: color || DEFAULT_FAMILY_COLOR } };
}

/**
 * The picked member ids, cleaned: strings only, trimmed, no blanks, no
 * repeats, never the creator, in first-seen order. A crafted post can send
 * anything, so a non-string is dropped rather than refused.
 */
export function cleanMemberIds(values: readonly unknown[], creatorId: string): string[] {
	const seen = new Set<string>();
	for (const value of values) {
		if (typeof value !== 'string') continue;
		const id = value.trim();
		if (!id || id === creatorId) continue;
		seen.add(id);
	}
	return [...seen];
}

/** Whether somebody picked cannot be added: every pick must be a verified account. */
export function hasUnaddablePick(picked: readonly string[], verifiedIds: ReadonlySet<string>): boolean {
	return picked.some((id) => !verifiedIds.has(id));
}

/**
 * The plan's member cap applied to the day-one roster: the creator counts as
 * one, so `1 + picked` may fill the limit but not pass it. With nobody picked
 * the empty shell is always allowed.
 */
export function dayOneRosterRefusal(memberLimit: number, pickedCount: number): FamilyRefusal | null {
	if (pickedCount === 0 || 1 + pickedCount <= memberLimit) return null;
	return {
		status: 403,
		message: `Your plan allows ${memberLimit} member${memberLimit === 1 ? '' : 's'} in a family. Create the family first, then add the rest from the family page.`
	};
}

/** The columns a rename/recolour writes; a key is absent when that field is unchanged. */
export type FamilyPatch = {
	readonly name?: string;
	readonly color?: string;
};

/**
 * What `PATCH /api/families/{id}` writes: the fields that are non-empty, and
 * null when there is nothing to write (an empty body is a success that touches
 * nothing). The name is already trimmed; the colour is any `#rrggbb` (Q-025).
 */
export function familyPatch(name: string, color: string): FamilyPatch | null {
	if (name && color) return { name, color };
	if (name) return { name };
	if (color) return { color };
	return null;
}

/** One roster row of a family: the avatar's user id is looked up by first name (below). */
export type CardRosterRow = {
	readonly familyId: string;
	readonly userId: string;
	readonly firstName: string;
};

/**
 * The card's roster strip, one entry per first name. The id comes from the
 * FIRST roster row of that family with the same first name, or `roster-{i}`
 * when none matches, so two members who share a first name both show the first
 * one's id (owner question Q-023: answered B, the real ids, applied after S6;
 * until then the golden pins this).
 */
export function cardMembers(
	familyId: string,
	firstNames: readonly string[],
	roster: readonly CardRosterRow[]
): { firstName: string; userId: string }[] {
	return firstNames.map((firstName, i) => ({
		firstName,
		userId:
			roster.find((row) => row.familyId === familyId && row.firstName === firstName)?.userId ??
			`roster-${i}`
	}));
}

/**
 * The card's "Created" label: `M/D/YYYY` in the zone it is given. S5 passes
 * `UTC`, the zone the legacy server printed `toLocaleDateString()` in on Vercel.
 */
export function familyCreatedLabel(createdAt: Date, zone: string): string {
	return new Intl.DateTimeFormat('en-US', {
		timeZone: zone,
		year: 'numeric',
		month: 'numeric',
		day: 'numeric'
	}).format(createdAt);
}

/** Compose one `/family` card from the membership read, the task count and the roster. */
export function buildFamilyCard(
	membership: FamilyMembershipView,
	openTasks: number,
	roster: readonly CardRosterRow[],
	zone: string
): FamilyCardView {
	const { family } = membership;
	return {
		...family,
		memberCount: membership.memberCount,
		openTasks,
		members: cardMembers(family.id, membership.firstNames, roster),
		createdLabel: familyCreatedLabel(family.createdAt, zone),
		canInvite: canManageInvites(membership.role),
		role: membership.role
	};
}

/** First name only: the invitation band says "Created by Maya". Null when unknown or blank. */
export function firstNameOf(
	roster: readonly { readonly userId: string; readonly firstName: string }[],
	userId: string | null | undefined
): string | null {
	if (!userId) return null;
	return roster.find((member) => member.userId === userId)?.firstName || null;
}
