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

/** The longest name `POST /api/me/api-tokens` keeps, in code points (Q-109). */
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
 * The name a token is stored under: cut at 60 CODE POINTS, then trimmed
 * (Q-109 B). Legacy did `name.trim().slice(0, 60)` on UTF-16 units
 * (`accountData.ts:429-443`), which split an emoji straddling unit 60 (Postgres
 * stored the lone half as U+FFFD) and kept whitespace that sat before the cut;
 * a code-point cut never splits a character, and the trim after it drops the
 * whitespace the cut left at the end. `''` means blank, which the wire refuses.
 */
export function apiTokenName(raw: string): string {
	return Array.from(raw).slice(0, API_TOKEN_NAME_MAX).join('').trim();
}
