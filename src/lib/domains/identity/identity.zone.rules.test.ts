/**
 * Pure rules: the stored-zone resolution. Expected values come from the legacy
 * code and its tests — `src/lib/server/utils/userTimezone.test.ts:5-14` — and
 * from Q-107 (a stored pseudo-zone or fixed offset keeps resolving; only the
 * PATCH validator narrowed).
 *
 * Doc: ../README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { zoneFromStored } from './identity.zone.rules';

describe('zoneFromStored', () => {
	// userTimezone.test.ts:5-14, plus the Luxon pseudo-zones: Q-107 narrows the
	// PATCH validator, never how an ALREADY stored zone resolves.
	it.each<[string | null | undefined, string | undefined]>([
		['America/Chicago', 'America/Chicago'],
		['UTC', 'UTC'],
		['local', 'local'],
		['UTC+5', 'UTC+5'],
		[null, undefined],
		[undefined, undefined],
		['', undefined],
		['Not/AZone', undefined]
	])('rejects missing, empty and invalid zones: %j → %j', (stored, expected) => {
		expect(zoneFromStored(stored)).toBe(expected);
	});
});
