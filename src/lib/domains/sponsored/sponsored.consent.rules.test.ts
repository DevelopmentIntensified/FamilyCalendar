/**
 * The consent-trail transition rule: a settings save appends a record only on
 * a real transition. Expected values come from the rule (README Invariants)
 * and the legacy pure cases it carries over, never from running the code.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import type { SponsoredConsentDecision } from './sponsored.contract';
import { SPONSORED_CONSENT_DECISIONS, sponsoredConsentDecision } from './sponsored.consent.rules';

describe('SPONSORED_CONSENT_DECISIONS', () => {
	it('is the two decisions a record can hold', () => {
		expect(SPONSORED_CONSENT_DECISIONS).toEqual(['granted', 'withdrawn']);
	});
});

describe('sponsoredConsentDecision(previous, next)', () => {
	// Legacy cases: src/lib/server/services/adConsentService.test.ts:85 (a grant from any
	// prior state), :92 (withdrawal), :96 (unchanged), :101 (never touched, saved off).
	it.each<[boolean | null | undefined, boolean, SponsoredConsentDecision | null]>([
		// not granted → on: consent given, whatever the prior non-true state
		[undefined, true, 'granted'],
		[null, true, 'granted'],
		[false, true, 'granted'],
		// on → off: consent withdrawn
		[true, false, 'withdrawn'],
		// unchanged: no event
		[true, true, null],
		[false, false, null],
		// never touched and saved with ads off: never asked, so no "declined" row
		[undefined, false, null],
		[null, false, null]
	])('previous %j, next %j → %j', (previous, next, expected) => {
		expect(sponsoredConsentDecision(previous, next)).toBe(expected);
	});
});
