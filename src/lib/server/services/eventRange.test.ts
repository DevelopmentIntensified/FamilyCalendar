import { describe, it, expect } from 'vitest';
import { MAX_RANGE_DAYS, resolveEventRange } from './eventRange';

const range = (query: string) => resolveEventRange(new URLSearchParams(query));

describe('resolveEventRange', () => {
	it('reads a from/to pair as the window it was asked for', () => {
		expect(range('from=2026-10-01&to=2026-10-31')).toEqual({
			from: '2026-10-01',
			to: '2026-10-31'
		});
	});

	it('accepts a single day', () => {
		expect(range('from=2026-10-01&to=2026-10-01')).toMatchObject({ from: '2026-10-01' });
	});

	it('refuses a range with only one end', () => {
		expect(range('from=2026-10-01')).toEqual({
			error: 'Ask for a range: ?from=YYYY-MM-DD&to=YYYY-MM-DD.'
		});
		expect(range('to=2026-10-31')).toHaveProperty('error');
	});

	it('refuses an unparseable date rather than guessing a window', () => {
		expect(range('from=october&to=2026-10-31')).toHaveProperty('error');
	});

	it('refuses a date that does not exist', () => {
		expect(range('from=2026-02-31&to=2026-03-05')).toHaveProperty('error');
	});

	it('refuses a backwards range', () => {
		expect(range('from=2026-10-31&to=2026-10-01')).toHaveProperty('error');
	});

	it('caps the window so one request cannot become the ±2 years it replaced', () => {
		const wide = range(`from=2026-01-01&to=2026-12-31`);
		expect(wide).toEqual({ error: `That range is wider than ${MAX_RANGE_DAYS} days.` });
		expect(MAX_RANGE_DAYS).toBeLessThanOrEqual(93);
	});

	it('serves a whole month, which is what the calendar asks for', () => {
		// 31 days of span — inside a 62-day cap.
		expect(range('from=2026-10-01&to=2026-10-31')).not.toHaveProperty('error');
	});
});