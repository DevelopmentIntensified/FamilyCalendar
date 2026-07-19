import { describe, it, expect } from 'vitest';
import { getEventTop, getEventHeight } from './weekView';

describe('getEventTop', () => {
	it('returns 75% for 6pm', () => {
		const date = new Date('2026-07-19T18:00:00');
		expect(getEventTop(date)).toBeCloseTo(75, 1);
	});

	it('returns 0% for midnight', () => {
		const date = new Date('2026-07-19T00:00:00');
		expect(getEventTop(date)).toBeCloseTo(0, 1);
	});

	it('returns 50% for noon', () => {
		const date = new Date('2026-07-19T12:00:00');
		expect(getEventTop(date)).toBeCloseTo(50, 1);
	});
});

describe('getEventHeight', () => {
	it('returns ~4.17% for a 1-hour event', () => {
		const start = new Date('2026-07-19T14:00:00');
		const end = new Date('2026-07-19T15:00:00');
		expect(getEventHeight(start, end)).toBeCloseTo(4.17, 0);
	});

	it('returns ~8.33% for a 2-hour event', () => {
		const start = new Date('2026-07-19T14:00:00');
		const end = new Date('2026-07-19T16:00:00');
		expect(getEventHeight(start, end)).toBeCloseTo(8.33, 0);
	});

	it('defaults to 1 hour when no end time', () => {
		const start = new Date('2026-07-19T14:00:00');
		expect(getEventHeight(start, undefined)).toBeCloseTo(4.17, 0);
	});
});
