/**
 * access invite-email rules: what an emailed family-invite token carries, the
 * accept form's password half and the copy each answer uses. Pure (R4/R5): the
 * signature check and its clock live in the service, and nothing here signs,
 * verifies or hashes.
 *
 * Wire facts ported from the legacy
 * `(marketing)/family/invite/email/+page.server.ts`: a token carries the
 * invitee's address and names, the family id and (since issue 152) the durable
 * invite row's code; a link without a token or with a token that does not
 * decode redirects to `/login?error=missing_token` / `…=invalid_token`; a
 * replay, a revoked code and an over-cap family are all ONE refusal; and the
 * password is at least 8 characters and confirmed.
 *
 * Doc: ./README.md#invariants
 */
import { z } from '$lib/kernel/validation/validators';

/** The claims the invite page reads back out of `EMAILSECRET`'s JWT. */
export type InviteEmailPayload = {
	readonly email: string;
	readonly firstName: string;
	readonly lastName: string;
	readonly familyId: string;
	/** Issue 152: the durable single-use row. Absent on every legacy token. */
	readonly inviteCode?: string;
};

/** `/login?error=` codes the legacy load redirected with. */
export const INVITE_EMAIL_MISSING_TOKEN = 'missing_token';
export const INVITE_EMAIL_INVALID_TOKEN = 'invalid_token';

/** The action's own two 400s, in its order. */
export const INVITE_EMAIL_MISSING_TOKEN_MESSAGE = 'Missing token';
export const INVITE_EMAIL_INVALID_TOKEN_MESSAGE = 'Invalid or expired token';

/**
 * One refusal covers a replayed, revoked, used-up or over-cap invite (#152),
 * so a forwarded link cannot tell which.
 */
export const INVITE_EMAIL_UNAVAILABLE_MESSAGE =
	'This invite link is no longer valid or has already been used.';

/** #246: success is a green `?notice=`, not a red `?error=`. */
export const INVITE_EMAIL_JOINED_MESSAGE = 'Family joined. Sign in to continue.';

/** The sign-up password floor (legacy `password.length < 8`). */
export const INVITE_PASSWORD_MIN_LENGTH = 8;

export const INVITE_PASSWORD_SHORT_MESSAGE = 'Password must be at least 8 characters';
export const INVITE_PASSWORD_MISMATCH_MESSAGE = 'Passwords do not match';

/**
 * One form field read the legacy way (`formString`): a repeated field reads its
 * first value, and anything that is not text reads as absent. The action then
 * decides the message, so a missing field is never a schema error.
 */
const formText = z.preprocess((value) => {
	const first = Array.isArray(value) ? value[0] : value;
	return typeof first === 'string' ? first : '';
}, z.string());

/** The accept form's four fields; `_action` is `skip` or the password path. */
export const InviteEmailForm = z.object({
	_action: formText,
	token: formText,
	password: formText,
	passwordConfirm: formText
});
export type InviteEmailForm = z.infer<typeof InviteEmailForm>;

/** The skip path's `_action`; anything else takes the password path. */
export const INVITE_EMAIL_SKIP_ACTION = 'skip';

/**
 * The token's claims, or null: legacy `isInvitePayload` plus its non-empty
 * check. `inviteCode` is optional but must be text when present — a token
 * without one is refused by the service (it cannot name a joinable row).
 */
export function readInviteEmailPayload(value: unknown): InviteEmailPayload | null {
	if (typeof value !== 'object' || value === null) return null;
	const claims = value as Record<string, unknown>;
	const { email, firstName, lastName, familyId, inviteCode } = claims;
	if (typeof email !== 'string' || !email) return null;
	if (typeof firstName !== 'string' || !firstName) return null;
	if (typeof lastName !== 'string' || !lastName) return null;
	if (typeof familyId !== 'string' || !familyId) return null;
	if (inviteCode !== undefined && typeof inviteCode !== 'string') return null;
	return {
		email,
		firstName,
		lastName,
		familyId,
		...(inviteCode === undefined ? {} : { inviteCode })
	};
}

/** `null` when the password may be used; otherwise the copy to answer with. */
export function inviteEmailPasswordRefusal(
	password: string,
	confirmation: string
): string | null {
	if (password.length < INVITE_PASSWORD_MIN_LENGTH) return INVITE_PASSWORD_SHORT_MESSAGE;
	if (password !== confirmation) return INVITE_PASSWORD_MISMATCH_MESSAGE;
	return null;
}
