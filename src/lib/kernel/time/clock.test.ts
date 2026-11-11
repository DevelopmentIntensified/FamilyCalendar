import { describe, expect, it } from 'vitest';
import { DEFAULT_TEST_NOW, fixedClock } from './clock';

describe('fixedClock', () => {
	it('starts at the documented default instant', () => {
		expect(fixedClock().now().toISOString()).toBe(DEFAULT_TEST_NOW);
	});

	it('moves only when told to', () => {
		const clock = fixedClock('2026-03-01T00:00:00.000Z');
		clock.advanceMs(90_000);
		expect(clock.now().toISOString()).toBe('2026-03-01T00:01:30.000Z');
		clock.set('2027-01-01T00:00:00Z');
		expect(clock.now().toISOString()).toBe('2027-01-01T00:00:00.000Z');
	});

	it('hands out copies so callers cannot mutate the clock', () => {
		const clock = fixedClock('2026-03-01T00:00:00.000Z');
		clock.now().setFullYear(1999);
		expect(clock.now().getUTCFullYear()).toBe(2026);
	});

	it('rejects a non-ISO start', () => {
		expect(() => fixedClock('next tuesday')).toThrow(/not an ISO instant/);
	});
});
