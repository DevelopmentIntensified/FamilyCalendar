/**
 * identity email-code rules: the code kinds, which kinds are stored as a
 * digest, the 15-minute TTL, the expiry predicate and the `(hash, email, type)`
 * lookup key.
 *
 * #162: sign-in codes never touch the database in plaintext (`codes.code`
 * holds the SHA-256 hex), and #154: every row is type-stamped so a code minted
 * for one flow cannot redeem another. Pure: "now" is a parameter (R5).
 *
 * Doc: ./README.md#invariants
 */
import { sha256Hex } from '$lib/kernel/ids/ids';

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
 * The kinds stored as a digest. `email_change` codes and `reset_used` markers
 * still keep their value in `codes.code` (`accountData.ts:391-399`,
 * `forgot-password/reset/+server.ts:101-119`); changing that is not this port.
 */
export const HASHED_EMAIL_CODE_TYPES = ['login', 'signup', 'password-signup'] as const;

/** A code (and its link) lives 15 minutes. */
export const EMAIL_CODE_TTL_MS = 15 * 60 * 1000;

/** Case-sensitive: a row is redeemed only by the exact kind it was stamped with. */
export function isHashedEmailCodeType(type: string): boolean {
	return HASHED_EMAIL_CODE_TYPES.some((hashed) => hashed === type);
}

/** When a code issued at `now` stops redeeming. */
export function emailCodeExpiresAt(now: Date): Date {
	return new Date(now.getTime() + EMAIL_CODE_TTL_MS);
}

/** Expired strictly before `now` (`lt(codes.expiresAt, now)`). */
export function isEmailCodeExpired(expiresAt: Date, now: Date): boolean {
	return expiresAt.getTime() < now.getTime();
}

/** What a hashed-code lookup or delete binds: never the plaintext. */
export type EmailCodeKey = {
	readonly codeHash: string;
	readonly email: string;
	readonly type: string;
};

/** The `(sha256Hex(code), email, type)` triple every hashed lookup and delete matches on. */
export function emailCodeKey(input: {
	readonly code: string;
	readonly email: string;
	readonly type: string;
}): EmailCodeKey {
	return { codeHash: sha256Hex(input.code), email: input.email, type: input.type };
}
