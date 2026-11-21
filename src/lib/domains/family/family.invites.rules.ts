/**
 * family invites rules: how many people a code admits, how long it lives, the
 * presets each way of inviting mints with, the one "can this code still be
 * used" predicate and the one refusal answer for a code that cannot be.
 *
 * `now` is always a parameter (rule R5): nothing here reads the clock.
 *
 * Doc: ./README.md#invariants
 */
import { clampedInt, type JsonValue } from '$lib/kernel/validation/validators';
import type { FamilyRefusal } from './family.roles.rules';

/**
 * How many people one join code admits when nobody says otherwise.
 *
 * Minting used to answer this twice with two numbers (the action defaulted to
 * one use, the route clamped to ten), so the same link meant two things
 * depending on the door it came out of (issue 091). Declared once, here. The
 * `familyInviteCodes.maxUses` column's own default of 1 is not a rule: every
 * insert states the count.
 */
export const DEFAULT_INVITE_MAX_USES = 10;

/** Validity in days when the mint door is not told. */
export const DEFAULT_INVITE_DAYS = 7;

/** The length of a minted code (the legacy `generateId(10)`). */
export const INVITE_CODE_LENGTH = 10;

const MS_PER_DAY = 86_400_000;

// The kernel clamp is the one home for "number or numeric string, junk falls
// back"; these two fix the family bounds around it.
const inviteDays = clampedInt(1, 30, DEFAULT_INVITE_DAYS);
const inviteUses = clampedInt(1, 50, DEFAULT_INVITE_MAX_USES);

/** `expiresInDays` from a body: 1-30, default 7; a fraction truncates, junk is the default. */
export function clampInviteDays(value: JsonValue | undefined): number {
	return inviteDays.parse(value);
}

/** `maxUses` from a body: 1-50, default 10; a fraction truncates, junk is the default. */
export function clampInviteUses(value: JsonValue | undefined): number {
	return inviteUses.parse(value);
}

/** What one way of inviting mints: a validity in days and a use cap. */
export type InviteMintPlan = {
	readonly days: number;
	readonly maxUses: number;
};

/** An emailed invite is addressed to one person: single use, one day. */
export const EMAIL_INVITE_PLAN: InviteMintPlan = { days: 1, maxUses: 1 };

/** A shareable link is the shared default cap, one day (issue 152). */
export const LINK_INVITE_PLAN: InviteMintPlan = { days: 1, maxUses: DEFAULT_INVITE_MAX_USES };

/** The mint door's plan: the body's two counts through their clamps. */
export function shareInvitePlan(
	expiresInDays: JsonValue | undefined,
	maxUses: JsonValue | undefined
): InviteMintPlan {
	return { days: clampInviteDays(expiresInDays), maxUses: clampInviteUses(maxUses) };
}

/** When a code minted at `now` lapses: `days` whole 24-hour days later. */
export function inviteExpiresAt(now: Date, days: number): Date {
	return new Date(now.getTime() + days * MS_PER_DAY);
}

/** The fields of an invite row the usability rule reads. */
export type InviteLife = {
	readonly expiresAt: Date;
	readonly maxUses: number | null;
	readonly useCount: number | null;
};

/**
 * Whether somebody could still join with this code at `now`: not expired
 * (a code is dead the instant `expiresAt` is reached) and, when it has a cap,
 * not used up. A null `maxUses` is no cap; a null `useCount` counts as zero.
 * This is the one predicate behind the `/family` list's live codes, the
 * detail payload's active code, the preview and the accept path.
 */
export function isInviteUsable(invite: InviteLife, now: Date): boolean {
	if (invite.expiresAt.getTime() <= now.getTime()) return false;
	return invite.maxUses === null || (invite.useCount ?? 0) < invite.maxUses;
}

/** Why an accept was refused, when the reason is not simply "this code does not work". */
export type InviteRefusalReason = 'family-full';

/**
 * The answer to "join with this code": accepted, or one refusal. Unknown,
 * expired, used-up and already-a-member are all the same `accepted: false`;
 * only the family-size cap says why.
 */
export type InviteAnswer =
	| { readonly accepted: true }
	| { readonly accepted: false; readonly reason?: InviteRefusalReason };

export type InviteRefusal = Extract<InviteAnswer, { accepted: false }>;

export function isInviteRefusal(answer: InviteAnswer): answer is InviteRefusal {
	return !answer.accepted;
}

/** The wire answer for a refused accept: 403 for the size cap, 400 for every other reason. */
export function inviteRefusalCopy(refusal: InviteRefusal): FamilyRefusal {
	if (refusal.reason === 'family-full') {
		return {
			status: 403,
			message: 'This family is full. The subscription member limit does not allow more members.'
		};
	}
	return { status: 400, message: 'Invalid, expired, or already used invite code' };
}

/** What the invite email renders: the inviter's name and the code-bound join link. */
export type FamilyInviteEmailInput = {
	readonly inviterName: string;
	readonly inviteUrl: string;
};

/**
 * The family-invite email's HTML (legacy `server/emails/family-invite.ts`): one
 * link, one deadline, one opt-out line for a stranger who did not ask for it.
 * Pure, so the send use-case renders it without a mailer.
 */
export function familyInviteEmailHtml({ inviterName, inviteUrl }: FamilyInviteEmailInput): string {
	return `
<p>${inviterName} invited you to join their family on Family Planz.</p>
<p><a href="${inviteUrl}">Join the family</a></p>
<p>The link expires in 24 hours. If you were not expecting this email, you can ignore it — nothing happens to your account.</p>
`.trim();
}
