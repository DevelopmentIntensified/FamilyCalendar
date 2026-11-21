/**
 * access password rules: the length floor every password path shares, the
 * four-field signup requirement and the reset form's own order (both fields,
 * then the length), plus the single-use reset marker's key shape.
 *
 * Pure (R4/R5): no clock, no environment, no database. The legacy checks are
 * `passwordSignup.ts:70-76` (signup) and `forgot-password/reset/+server.ts:70-80`
 * (reset); the marker is `reset/+server.ts:101`.
 *
 * Doc: ./README.md#invariants
 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Why a password form was refused. The wire copy for each reason is the
 * contract's (`SIGNUP_FIELDS_REQUIRED_MESSAGE`, `PASSWORD_TOO_SHORT_MESSAGE`,
 * `RESET_FIELDS_REQUIRED_MESSAGE`), so a caller maps it once.
 */
export type PasswordRefusal = 'missing-fields' | 'short-password';

export type PasswordSignupFields = {
	readonly email: string;
	readonly password: string;
	readonly firstName: string;
	readonly lastName: string;
};

export type PasswordResetFields = {
	readonly token: string;
	readonly password: string;
};

/**
 * Signup order: all four fields, then the length (`passwordSignup.ts:70-76`).
 * A taken address is NOT a refusal here — it is the same success shape, and
 * that decision belongs to the service.
 */
export function passwordSignupRefusal(fields: PasswordSignupFields): PasswordRefusal | null {
	if (!fields.email || !fields.password || !fields.firstName || !fields.lastName) {
		return 'missing-fields';
	}
	if (fields.password.length < PASSWORD_MIN_LENGTH) return 'short-password';
	return null;
}

/**
 * Reset order: token and password present, then the length
 * (`reset/+server.ts:70-80`). The length check runs BEFORE the token is
 * verified, which is why a forged token with a short password reads as a
 * short-password refusal.
 */
export function passwordResetRefusal(fields: PasswordResetFields): PasswordRefusal | null {
	if (!fields.token || !fields.password) return 'missing-fields';
	if (fields.password.length < PASSWORD_MIN_LENGTH) return 'short-password';
	return null;
}

/**
 * The durable single-use key for a reset token (`reset/+server.ts:101`):
 * `used:<sha256(token)>`. The hash itself is the caller's (`sha256Hex`), so
 * this stays a pure string rule.
 */
export function resetUsedMarker(tokenHash: string): string {
	return `used:${tokenHash}`;
}
