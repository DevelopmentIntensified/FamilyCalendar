/**
 * Pure AI-allowance rules: the period, the remaining count, the cap refusal
 * and the free/paid split. Expected values come from the README Invariants and
 * the legacy service they cite (`subscriptionService.ts`), never from running
 * the code.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { aiAllowance, aiLimitRefusal, aiPeriod, isPaidTier } from './billing.ai.rules';

describe('aiPeriod', () => {
	it.each<[string, number, number]>([
		['2026-11-12T23:30:00Z', 11, 2026],
		['2026-01-01T00:00:00Z', 1, 2026],
		['2026-12-31T23:59:59.999Z', 12, 2026],
		['2028-02-29T12:00:00Z', 2, 2028]
	])('%s → month %i of %i', (instant, month, year) => {
		expect(aiPeriod(new Date(instant))).toEqual({ month, year });
	});
});

describe('aiAllowance', () => {
	it.each<[number, number, number]>([
		[0, 10, 10],
		[7, 10, 3],
		[9, 10, 1],
		[10, 10, 0],
		[12, 10, 0],
		[0, 0, 0]
	])('allowance never goes negative: used %i of %i → %i remaining', (used, limit, remaining) => {
		expect(aiAllowance(used, limit)).toEqual({ used, limit, remaining });
	});
});

describe('aiLimitRefusal', () => {
	it('is null while there is any allowance left', () => {
		expect(aiLimitRefusal({ used: 9, limit: 10, remaining: 1 })).toBeNull();
	});

	it('refuses with the monthly cap copy when the allowance is spent', () => {
		expect(aiLimitRefusal({ used: 10, limit: 10, remaining: 0 })).toBe(
			'AI feature limit reached (10 per month). Upgrade to unlock unlimited AI.'
		);
	});

	it('allows a NaN allowance, like legacy (every comparison is false)', () => {
		expect(aiLimitRefusal({ used: Number.NaN, limit: 10, remaining: Number.NaN })).toBeNull();
	});

	it('never lets a paid tier read as unlimited in the copy', () => {
		// The paid seed tier's 999999 is still a real ceiling for this counter.
		expect(aiLimitRefusal({ used: 999999, limit: 999999, remaining: 0 })).toBe(
			'AI feature limit reached (999999 per month). Upgrade to unlock unlimited AI.'
		);
	});
});

describe('isPaidTier', () => {
	it.each<[string | null | undefined, boolean]>([
		[null, false],
		[undefined, false],
		['free', false],
		['cal_master', true],
		['family_master', true],
		['', true]
	])('%j → %s', (tierName, expected) => {
		expect(isPaidTier(tierName)).toBe(expected);
	});
});
