import { describe, expect, it } from 'vitest';
import { splitByRecurrence } from './taskRecurrence';

/** Table rows keyed by the definition under test. */
const row = (id: string, recurrenceFrequency?: string | null) => ({
	id,
	recurrenceFrequency
});

describe('splitByRecurrence (issue 203)', () => {
	it('partitions the owner-approved table: null/absent one-off, frequency recurring', () => {
		// Definition: recurrenceFrequency is not null → recurring. The table's
		// edge cases: a null column, a row missing the field entirely, and '' —
		// which matches the server's IS NOT NULL seat (dashboard.ts:208).
		const table: [string, string | null | undefined, 'recurring' | 'oneOff'][] = [
			['null', null, 'oneOff'],
			['absent', undefined, 'oneOff'],
			["''", '', 'recurring'],
			['daily', 'daily', 'recurring'],
			['weekly', 'weekly', 'recurring']
		];
		for (const [, freq, bucket] of table) {
			const split = splitByRecurrence([row('r1', freq)]);
			expect(split).toEqual({ recurring: bucket === 'recurring' ? [row('r1', freq)] : [], oneOff: bucket === 'oneOff' ? [row('r1', freq)] : [] });
		}
	});

	it('never puts a recurring task in the one-off bucket, nor the reverse', () => {
		// Ticket criterion (1). Interleave so a zipping bug would surface.
		const rows = [
			row('a1', null),
			row('a2', 'weekly'),
			row('a3'),
			row('a4', 'daily')
		];
		const split = splitByRecurrence(rows);
		const recurringIds = split.recurring.map((t) => t.id).sort();
		const oneOffIds = split.oneOff.map((t) => t.id).sort();
		expect(recurringIds).toEqual(['a2', 'a4']);
		expect(oneOffIds).toEqual(['a1', 'a3']);
		for (const id of recurringIds) expect(oneOffIds).not.toContain(id);
		for (const id of oneOffIds) expect(split.recurring.map((t) => t.id)).not.toContain(id);
	});

	it('preserves input order inside each bucket, nothing lost', () => {
		const rows = [
			row('o1', null),
			row('r1', 'daily'),
			row('o2', null),
			row('r2', 'weekly'),
			row('o3')
		];
		const split = splitByRecurrence(Object.freeze(rows));
		expect(split.recurring.map((t) => t.id)).toEqual(['r1', 'r2']);
		expect(split.oneOff.map((t) => t.id)).toEqual(['o1', 'o2', 'o3']);
		expect(split.recurring.length + split.oneOff.length).toBe(rows.length);
	});

	it('partitions nothing into empty buckets', () => {
		expect(splitByRecurrence([])).toEqual({ recurring: [], oneOff: [] });
	});
});
