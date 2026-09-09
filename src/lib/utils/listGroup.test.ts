import { describe, it, expect } from 'vitest';
import { dateKeyOf, groupByDateKey, toDateMs } from './listGroup';

describe('toDateMs', () => {
	it('handles Date, ISO string, and empty', () => {
		expect(toDateMs(new Date('2026-09-09T12:00:00Z'))).toBe(
			new Date('2026-09-09T12:00:00Z').getTime()
		);
		expect(toDateMs('2026-09-09T12:00:00.000Z')).toBe(new Date('2026-09-09T12:00:00Z').getTime());
		expect(toDateMs(null)).toBeNaN();
		expect(toDateMs(undefined)).toBeNaN();
	});
});

describe('dateKeyOf', () => {
	it('normalizes Date and ISO string to the same ISO day', () => {
		expect(dateKeyOf(new Date('2026-09-09T12:00:00Z'))).toBe('2026-09-09');
		expect(dateKeyOf('2026-09-09T23:59:00')).toBe('2026-09-09');
	});
});

describe('groupByDateKey', () => {
	it('buckets items by day, skipping dateless', () => {
		const items = [
			{ id: 1, date: '2026-09-09T10:00:00' },
			{ id: 2, date: '2026-09-09T15:00:00' },
			{ id: 3, date: '2026-09-10T09:00:00' },
			{ id: 4, date: null }
		];
		const grouped = groupByDateKey(items, (i) => i.date);
		expect(Object.keys(grouped).sort()).toEqual(['2026-09-09', '2026-09-10']);
		expect(grouped['2026-09-09'].map((i) => i.id)).toEqual([1, 2]);
		expect(grouped['2026-09-10'].map((i) => i.id)).toEqual([3]);
	});

	it('returns empty record for empty input', () => {
		expect(groupByDateKey([], () => '2026-09-09')).toEqual({});
	});
});
