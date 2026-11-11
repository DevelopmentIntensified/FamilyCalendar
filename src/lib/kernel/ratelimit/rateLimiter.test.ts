import { describe, expect, it } from 'vitest';
import { fixedClock } from '../time/clock';
import { clientKeyOf, createMemoryRateLimiter } from './rateLimiter';

describe('createMemoryRateLimiter', () => {
	it('allows `limit` hits per window, then refuses until the oldest hit ages out', () => {
		const clock = fixedClock('2026-01-01T00:00:00Z');
		const limiter = createMemoryRateLimiter(clock);
		const window = 60_000;

		expect([1, 2, 3].map(() => limiter.allow('k', 3, window))).toEqual([true, true, true]);
		expect(limiter.allow('k', 3, window)).toBe(false);

		clock.advanceMs(window - 1);
		expect(limiter.allow('k', 3, window)).toBe(false);

		clock.advanceMs(1);
		expect(limiter.allow('k', 3, window)).toBe(true);
	});

	it('keeps buckets independent and forgets them on reset', () => {
		const limiter = createMemoryRateLimiter(fixedClock());
		expect(limiter.allow('a', 1, 1000)).toBe(true);
		expect(limiter.allow('a', 1, 1000)).toBe(false);
		expect(limiter.allow('b', 1, 1000)).toBe(true);
		limiter.reset();
		expect(limiter.allow('a', 1, 1000)).toBe(true);
	});
});

describe('clientKeyOf', () => {
	const request = (headers: Record<string, string>) => new Request('http://x.test/', { headers });

	it.each([
		[{ 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }, 'login:1.1.1.1'],
		[{ 'x-forwarded-for': '3.3.3.3, 10.0.0.1' }, 'login:3.3.3.3'],
		[{}, 'login:local']
	])('keys %j as %s', (headers, key) => {
		expect(clientKeyOf(request(headers), 'login')).toBe(key);
	});
});
