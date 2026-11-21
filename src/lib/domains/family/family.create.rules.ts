/**
 * family create rules: the `/family/create` page's pure presentation logic.
 *
 * The page names the chosen swatch in plain words, draws one avatar per pick
 * plus a dashed slot while the family is still tiny, counts the room the plan
 * leaves, and prints the plan banner and the usage line. The create use-case
 * itself (validation, the plan gate, the transaction) lives in
 * `family.families.service.server.ts`; nothing here decides anything the
 * server would refuse.
 *
 * Doc: ./README.md#invariants
 */
import { FAMILY_PALETTE } from './family.palette.rules';

/**
 * The approved preview draws its dashed "+" slot while fewer than two people
 * are picked (`family-create.html:63-66`), so a new family always shows room.
 */
export const FAMILY_PREVIEW_SLOT_BELOW = 2;

/** The plain-word name of the chosen colour; an unknown value falls back to the first swatch. */
export function familyPaletteName(color: string): string {
	return FAMILY_PALETTE.find((swatch) => swatch.value === color)?.name ?? FAMILY_PALETTE[0].name;
}

/** "ML", or "?" for a person with no usable name. */
export function familyPreviewInitials(person: {
	readonly firstName?: string | null;
	readonly lastName?: string | null;
}): string {
	const first = person.firstName?.charAt(0) ?? '';
	const last = person.lastName?.charAt(0) ?? '';
	return (first + last).toUpperCase() || '?';
}

/**
 * How many people may still be picked: the creator counts against the plan's
 * member limit, so the room is one short of it.
 */
export function familyPickRoomLeft(memberLimit: number, pickedCount: number): number {
	return memberLimit - 1 - pickedCount;
}

/** The usage line under the form: "1 of 3 families used on your plan." */
export function familyCreateUsageLabel(used: number, limit: number): string {
	return `${used} of ${limit} ${limit === 1 ? 'family' : 'families'} used on your plan.`;
}

/** The banner at the limit; a missing limit prints 1, as legacy did (`limit || 1`). */
export function familyLimitBannerCopy(limit: number): string {
	const shown = limit || 1;
	return `You've reached your family limit (${shown} family). Upgrade to Family Master to create unlimited families.`;
}
