/**
 * identity email-code rules: the code kinds (every one stored as a keyed
 * digest), the 15-minute TTL, the expiry predicate and the `(hash, email,
 * type)` lookup key.
 *
 * #162 + Q-116 (answered B): no email code ever touches the database in
 * plaintext — the three sign-in kinds, the email-change code and the
 * password-reset marker alike — and #154: every row is type-stamped so a code
 * minted for one flow cannot redeem another. Q-117 (answered B): the stored
 * value is `HMAC-SHA-256(pepper, code)`, not a bare SHA-256, because a 6–8
 * digit code is reversed from a bare digest in seconds. Pure: "now" and
 * `production` are parameters (R5/R6).
 *
 * Doc: ./README.md#invariants
 */
import { hmacSha256Hex } from '$lib/kernel/ids/ids';

/**
 * Every kind a legacy writer stamps: the three sign-in kinds, the email-change
 * code and the password-reset single-use marker. `signup` is the column default.
 */
export const EMAIL_CODE_TYPES = [
	'signup',
	'login',
	'password-signup',
	'email_change',
	'reset_used'
] as const;

/**
 * The kinds stored as a digest: every one of them (Q-116 answered B), so this
 * is `EMAIL_CODE_TYPES` under the name the storage policy reads by. There is no
 * second list to keep in step — a kind added to the vocabulary is hashed.
 */
export const HASHED_EMAIL_CODE_TYPES = EMAIL_CODE_TYPES;

/**
 * The pepper a zero-env build hashes with. Public knowledge (it is in the
 * repo), so production never uses it — Q-117.
 */
export const CODE_PEPPER_PLACEHOLDER = 'code-pepper-placeholder-change-me';

/**
 * The email-code pepper (`EMAILSECRET`). Production without it fails closed at
 * boot; elsewhere the placeholder keeps `npm run build` working with no env.
 * Same shape as `resolveSessionSecret` (`session.rules.ts`): an empty secret
 * outside production is used as-is (`secret ?? placeholder`).
 */
export function resolveCodePepper(secret: string | undefined, production: boolean): string {
	if (!secret && production) {
		throw new Error(
			'EMAILSECRET is required in production — refusing to store email codes with the placeholder pepper.'
		);
	}
	return secret ?? CODE_PEPPER_PLACEHOLDER;
}

/** A code (and its link) lives 15 minutes. */
export const EMAIL_CODE_TTL_MS = 15 * 60 * 1000;

/** When a code issued at `now` stops redeeming. */
export function emailCodeExpiresAt(now: Date): Date {
	return new Date(now.getTime() + EMAIL_CODE_TTL_MS);
}

/** Expired strictly before `now` (`lt(codes.expiresAt, now)`). */
export function isEmailCodeExpired(expiresAt: Date, now: Date): boolean {
	return expiresAt.getTime() < now.getTime();
}

/** What an email-code lookup or delete binds: never the plaintext. */
export type EmailCodeKey = {
	readonly codeHash: string;
	readonly email: string;
	readonly type: string;
};

/** The `(HMAC-SHA-256(pepper, code), email, type)` triple every lookup and delete matches on. */
export function emailCodeKey(
	input: {
		readonly code: string;
		readonly email: string;
		readonly type: string;
	},
	pepper: string
): EmailCodeKey {
	return { codeHash: hmacSha256Hex(pepper, input.code), email: input.email, type: input.type };
}
