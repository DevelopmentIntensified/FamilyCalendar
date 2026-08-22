import { describe, it, expect } from 'vitest';
import { parseBulkPlan } from './bulkAiService';

const IDS = ['evt-1', 'evt-2', 'evt-3'];

describe('parseBulkPlan', () => {
	it('parses ops wrapped in {ops: []}', () => {
		const content = JSON.stringify({
			ops: [
				{ id: 'evt-1', title: 'Soccer practice', date: '2026-09-04' },
				{ id: 'evt-2', location: 'Community Hall' }
			]
		});
		const ops = parseBulkPlan(content, IDS);
		expect(ops).toHaveLength(2);
		expect(ops[0]).toEqual({ id: 'evt-1', title: 'Soccer practice', date: '2026-09-04' });
		expect(ops[1]).toEqual({ id: 'evt-2', location: 'Community Hall' });
	});

	it('accepts a bare array', () => {
		const content = JSON.stringify([{ id: 'evt-3', startTime: '9:30' }]);
		const ops = parseBulkPlan(content, IDS);
		expect(ops).toHaveLength(1);
		expect(ops[0].startTime).toBe('09:30');
	});

	it('drops ids outside the allowed set (hallucination guard)', () => {
		const content = JSON.stringify({
			ops: [
				{ id: 'evt-1', title: 'Keep' },
				{ id: 'evt-999', title: 'Drop' }
			]
		});
		const ops = parseBulkPlan(content, IDS);
		expect(ops).toHaveLength(1);
		expect(ops[0].id).toBe('evt-1');
	});

	it('rejects malformed field values and empty ops', () => {
		const content = JSON.stringify({
			ops: [
				{ id: 'evt-1', date: 'September 4th' },
				{ id: 'evt-2', startTime: '25:99' },
				{ id: 'evt-3' }
			]
		});
		expect(parseBulkPlan(content, IDS)).toHaveLength(0);
	});

	it('deduplicates repeated ids keeping the first valid op', () => {
		const content = JSON.stringify({
			ops: [
				{ id: 'evt-1', title: 'First' },
				{ id: 'evt-1', title: 'Second' }
			]
		});
		const ops = parseBulkPlan(content, IDS);
		expect(ops).toHaveLength(1);
		expect(ops[0].title).toBe('First');
	});

	it('returns [] on invalid JSON', () => {
		expect(parseBulkPlan('not json at all', IDS)).toEqual([]);
	});
});
