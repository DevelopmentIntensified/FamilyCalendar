/**
 * family invitations rules: the `/family/invitations` page's pure logic — the
 * validity choices and bounds its New-code band offers, which code the page is
 * "really about" (the live one), the other codes, and the use-slot strip.
 *
 * The route's clamps (`clampInviteDays` 1–30, `clampInviteUses` 1–50) stay in
 * `family.invites.rules.ts`; the band is narrower on purpose (the approved
 * prototype's 1–20), so this file declares the UI's offer and the server keeps
 * the last word.
 *
 * Doc: ./README.md#invariants
 */
import type { InviteCodeView } from './family.contract';
import { isInviteUsable } from './family.invites.rules';

/** One validity option in the New-code select, in the page's order. */
export type FamilyValidityChoice = { readonly label: string; readonly days: number };

/** The approved New-code select (`family-invitations.html:104-117`). */
export const FAMILY_VALIDITY_CHOICES: readonly FamilyValidityChoice[] = [
	{ label: '7 days', days: 7 },
	{ label: '24 hours', days: 1 },
	{ label: '30 days', days: 30 }
];

/** The prototype's bounds for the Max uses field; the route clamps wider (1–50). */
export const FAMILY_MAX_USES_MIN = 1;
export const FAMILY_MAX_USES_MAX = 20;
export const FAMILY_INVITE_DEFAULT_USES = 10;
export const FAMILY_INVITE_DEFAULT_DAYS = 7;

/** The one code the page is really about: the first live one, else null. */
export function familyLiveInvite(
	invitations: readonly InviteCodeView[],
	now: Date
): InviteCodeView | null {
	return invitations.find((invite) => isInviteUsable(invite, now)) ?? null;
}

/** Every other code the family holds, spent or not, in the loader's order. */
export function familyOtherInvites(
	invitations: readonly InviteCodeView[],
	live: InviteCodeView | null
): InviteCodeView[] {
	return invitations.filter((invite) => invite !== live);
}

/**
 * The live code drawn as one segment per allowed use: the first `useCount` are
 * spent. A code with no ceiling has no strip (`[]`).
 */
export function familyInviteUseSlots(invite: {
	readonly useCount: number | null;
	readonly maxUses: number | null;
}): ('used' | 'free')[] {
	if (invite.maxUses === null) return [];
	const used = invite.useCount ?? 0;
	return Array.from({ length: invite.maxUses }, (_unused, index) =>
		index < used ? 'used' : 'free'
	);
}

/** "2 of 5 used · expires 12/1/2026" — a code with no ceiling prints ∞. */
export function familyInviteMetaLabel(invite: {
	readonly useCount: number | null;
	readonly maxUses: number | null;
	readonly expiresAt: Date | string;
}): string {
	const expires = invite.expiresAt instanceof Date ? invite.expiresAt : new Date(invite.expiresAt);
	const expiry = isNaN(expires.getTime()) ? '' : expires.toLocaleDateString();
	return `${invite.useCount ?? 0} of ${invite.maxUses ?? '∞'} used · expires ${expiry}`;
}

/** The toast a successful mint names: the code itself, then what to do with it. */
export function familyNewCodeToast(code: string): string {
	return `New code ${code} is live — send it to whoever you are inviting.`;
}

/** The toast a revoke names, with the consequence spelled out. */
export function familyCodeRevokedToast(code: string): string {
	return `${code} revoked — anybody still holding the link is now locked out.`;
}

/** The copy-failure line under the live code, shared with the other codes. */
export const FAMILY_COPY_FAILED_COPY = 'Copy failed — select the link above and copy it manually.';

/** The family switcher's label, printed above the pills only when there is a choice. */
export const FAMILY_SWITCHER_LABEL = 'Choose a family';

/** The copy a plain member sees instead of the codes. */
export const FAMILY_MEMBER_INVITES_NOTICE =
	'Only the family creator or an admin can manage invitations.';
