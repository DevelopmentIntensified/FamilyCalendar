/**
 * sponsored consent rules: the vocabulary of the consent trail and the one
 * transition rule that decides whether a settings save appends a record
 * (legacy `adConsentService.ts:21-36`).
 *
 * A record is evidence, never permission: the serve gate reads only the
 * settings flag (`shouldServeSponsoredEvents`), and a read never writes a
 * record. One record per consent EVENT, so "prove I consented" and "when did
 * they withdraw" are answerable from the trail without it becoming a serve log.
 *
 * Doc: ./README.md#invariants
 */
import type { SponsoredConsentDecision } from './sponsored.contract';

/** The decisions a consent record can hold. */
export const SPONSORED_CONSENT_DECISIONS = ['granted', 'withdrawn'] as const;

/**
 * The decision a settings save records, or `null` when there is no event.
 * `previous` is the flag the row held BEFORE the save (absent row → `undefined`).
 * Not-granted → `true` records `granted`; `true` → `false` records `withdrawn`;
 * an unchanged value records nothing — and so does a never-touched user saving
 * with ads off: they were never asked, so a "declined" row would be fabricated.
 */
export function sponsoredConsentDecision(
	previous: boolean | null | undefined,
	next: boolean
): SponsoredConsentDecision | null {
	const wasGranted = previous === true;
	if (wasGranted === next) return null;
	return next ? 'granted' : 'withdrawn';
}
