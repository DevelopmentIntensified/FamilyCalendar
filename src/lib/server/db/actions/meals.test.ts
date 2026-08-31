import { describe, it, expect } from 'vitest';
import { isMealKind, isMealDate, MEAL_KINDS } from './meals';

describe('isMealKind', () => {
	it('accepts every canonical kind', () => {
		for (const kind of MEAL_KINDS) expect(isMealKind(kind)).toBe(true);
	});

	it('rejects unknown kinds', () => {
		expect(isMealKind('brunch')).toBe(false);
		expect(isMealKind('breakfast ')).toBe(false);
		expect(isMealKind('')).toBe(false);
		expect(isMealKind('LUNCH')).toBe(false);
	});
});

describe('isMealDate', () => {
	it('accepts YYYY-MM-DD keys', () => {
		expect(isMealDate('2026-08-30')).toBe(true);
		expect(isMealDate('1999-01-01')).toBe(true);
	});

	it('rejects anything that is not a zero-padded date key', () => {
		expect(isMealDate('2026-8-30')).toBe(false);
		expect(isMealDate('2026-08-30T00:00:00Z')).toBe(false);
		expect(isMealDate('08/30/2026')).toBe(false);
		expect(isMealDate('')).toBe(false);
		expect(isMealDate('today')).toBe(false);
	});
});