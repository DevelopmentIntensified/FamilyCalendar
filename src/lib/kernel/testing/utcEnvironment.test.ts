import { describe, expect, it } from 'vitest';

describe('v2 test environment', () => {
	it('runs in UTC, like production', () => {
		// Production's Node runs in UTC, so day boundaries and ISO slices in the
		// v2 code and goldens assume offset 0. July, because a zone with DST has a
		// non-zero offset then: only UTC reports 0 all year. vite.config.ts sets
		// `test.env.TZ` for the unit, db and ui projects, and Vitest writes it
		// into the worker before any test file is imported.
		expect(process.env.TZ).toBe('UTC');
		expect(new Date('2026-07-01T12:00:00Z').getTimezoneOffset()).toBe(0);
	});
});
