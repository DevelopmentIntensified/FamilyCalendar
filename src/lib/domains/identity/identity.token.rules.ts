/**
 * identity token rules: the personal API token format (`fp_` + 32 random
 * bytes as unpadded base64url, 43 chars), its cheap format guard and the name
 * cut. Tokens live until revoked: no expiry, no scopes (#169 stays a separate
 * ticket).
 *
 * Pure: the random bytes are a parameter (R5); the token service draws them.
 * The stored form is kernel `sha256Hex(plaintext)`, byte-identical to legacy
 * `hashApiToken`, and the plaintext is returned only by the mint.
 *
 * Doc: ./README.md#invariants
 */
import { encodeBase64urlNoPadding } from '@oslojs/encoding';

/** Every personal API token starts with this. */
export const API_TOKEN_PREFIX = 'fp_';

/** Random bytes per token: 256 bits, 43 base64url characters. */
export const API_TOKEN_BYTES = 32;

/** The longest name `POST /api/me/api-tokens` keeps, in UTF-16 units (Q-109). */
export const API_TOKEN_NAME_MAX = 60;

/** The plaintext for `API_TOKEN_BYTES` random bytes: `fp_` + unpadded base64url. */
export function apiTokenPlaintext(randomBytes: Uint8Array): string {
	return API_TOKEN_PREFIX + encodeBase64urlNoPadding(randomBytes);
}

/**
 * Only an `fp_` token is worth a lookup; anything else is refused before the
 * database is touched (`apiTokens.ts:83`).
 */
export function isApiTokenFormat(token: string): boolean {
	return token.startsWith(API_TOKEN_PREFIX);
}

/**
 * The name a token is stored under: trimmed, then cut at 60 UTF-16 units
 * (`name.trim().slice(0, 60)`, `accountData.ts:429-443`). The cut can split an
 * emoji (Postgres stores the lone half as U+FFFD) and keeps whitespace that
 * sits before it; Q-109 moves it to code points after S6. `''` means blank,
 * which the wire refuses.
 */
export function apiTokenName(raw: string): string {
	return raw.trim().slice(0, API_TOKEN_NAME_MAX);
}
