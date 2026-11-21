/**
 * The serve gate. Expected values come from the README Invariants and the
 * legacy pure cases (adService.test.ts), never from running the code.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { shouldServeSponsoredEvents, type SponsoredServeSettings } from './sponsored.serve.rules';

/**
 * A settings row full of other preferences, the ad flag off. Bound to a
 * variable so TypeScript does not excess-property-check it: the point is that
 * no other field can grant consent.
 */
const rowFullOfOtherPreferences = {
	showAdsAsEvents: false,
	showAdMarkers: true,
	personalizedAds: true,
	showDailyVerse: true,
	weekStart: 'monday'
};

describe('shouldServeSponsoredEvents — the one serve gate', () => {
	// Legacy cases: src/lib/server/services/adService.test.ts:66 (true serves), :70 (false
	// and null withhold), :75 (no row at all withholds), :83 (no other field grants).
	it.each<[string, SponsoredServeSettings | null | undefined, boolean]>([
		['the flag true', { showAdsAsEvents: true }, true],
		['the flag false', { showAdsAsEvents: false }, false],
		['the flag null', { showAdsAsEvents: null }, false],
		['no flag on the row', {}, false],
		['no settings row (null)', null, false],
		['no settings row (undefined)', undefined, false],
		['every other field set, flag false', rowFullOfOtherPreferences, false]
	])('%s → %s', (_label, settings, expected) => {
		expect(shouldServeSponsoredEvents(settings)).toBe(expected);
	});
});
