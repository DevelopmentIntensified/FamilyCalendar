/**
 * access Claim rules: what a Claim link IS (32 random bytes, only the SHA-256
 * stored, 15-minute TTL), how the requested address is read, who may ask for
 * one, and the one answer that does not leak registration.
 *
 * Pure (R4/R5): the clock is a parameter and the random bytes are the S5
 * random port's job (`CLAIM_TOKEN_BYTES` says how many). Ported from legacy
 * `claimService.ts:6-48` and `claimRequest.ts:46-85`.
 *
 * Doc: ./README.md#invariants
 */
import { sha256Hex } from '$lib/kernel/ids/ids';
import { isRegisteredPerson, type AccessPerson } from './access.person.rules';

/** `randomBytes(32)` — the token is 64 hex characters before hashing. */
export const CLAIM_TOKEN_BYTES = 32;

/** A Claim link lives 15 minutes (`claimService.ts:7`). */
export const CLAIM_TOKEN_TTL_MS = 15 * 60 * 1000;

/** What only ever reaches `claim_tokens.token_hash`. */
export const CLAIM_TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;

/** The Claim address rule requires a dot (`claimRequest.ts:57`). */
const CLAIM_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Why a Claim request was refused before any token is minted. */
export type ClaimRequestRefusal = 'already-has-email' | 'invalid-email';

/**
 * Which copy the Claim email uses. The request's answer is identical either
 * way; only the sentence a person reads differs (`claimRequest.ts:76-84`).
 */
export type ClaimEmailVariant = 'save' | 'merge';

/**
 * The requested address as the rule sees it: a non-string reads `''`, then
 * trim + lowercase (`claimRequest.ts:56`).
 */
export function claimEmail(rawEmail: unknown): string {
	return (typeof rawEmail === 'string' ? rawEmail : '').trim().toLowerCase();
}

export function isClaimEmail(email: string): boolean {
	return CLAIM_EMAIL_PATTERN.test(email);
}

/** When a Claim link issued at `now` stops working. */
export function claimTokenExpiry(now: Date): Date {
	return new Date(now.getTime() + CLAIM_TOKEN_TTL_MS);
}

/** The only stored form of a Claim token: lowercase sha256 hex. */
export function claimTokenHash(token: string): string {
	return sha256Hex(token);
}

/**
 * The guests-only check first (a registered person is refused before the
 * address is read), then the dot rule. Throttles are the service's.
 */
export function claimRequestRefusal(
	actor: AccessPerson | null | undefined,
	rawEmail: unknown
): ClaimRequestRefusal | null {
	if (isRegisteredPerson(actor)) return 'already-has-email';
	if (!isClaimEmail(claimEmail(rawEmail))) return 'invalid-email';
	return null;
}

/** "Save your calendar" for a fresh address, "Merge my calendar" for a taken one. */
export function claimEmailVariant(alreadyRegistered: boolean): ClaimEmailVariant {
	return alreadyRegistered ? 'merge' : 'save';
}
