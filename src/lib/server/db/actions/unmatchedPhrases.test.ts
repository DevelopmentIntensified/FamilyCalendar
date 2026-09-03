import { describe, it, expect } from 'vitest';
import { buildUnmatchedReport, normalizePhrase } from './unmatchedPhrases';

describe('normalizePhrase', () => {
	it('lowercases, collapses whitespace, trims, and caps length', () => {
		expect(normalizePhrase('  Lunch   FRIDAY ')).toBe('lunch friday');
		expect(normalizePhrase('x'.repeat(300)).length).toBeLessThanOrEqual(280);
		expect(normalizePhrase('   ')).toBe('');
	});
});

describe('buildUnmatchedReport', () => {
	it('returns null for blank phrases', () => {
		expect(buildUnmatchedReport('event_parse', '   ')).toBeNull();
	});

	it('packs values for insert with stringified matches', () => {
		const built = buildUnmatchedReport('event_parse', 'Launch Sept 23', {
			title: 'Launch',
			date: '2026-09-23'
		});
		expect(built?.normalized).toBe('launch sept 23');
		expect(built?.values).toMatchObject({ source: 'event_parse', phrase: 'launch sept 23' });
		expect(JSON.parse(String(built?.values.matched))).toEqual({
			title: 'Launch',
			date: '2026-09-23'
		});
	});

	it('refreshes the match sample on conflict when matches are provided', () => {
		const built = buildUnmatchedReport('bulk_edit', 'Move to Friday', {
			ops: [{ id: 'e1', date: '2026-09-04' }]
		});
		expect(built?.conflictSet).toMatchObject({ sample: 'move to friday' });
		expect(JSON.parse(String(built?.conflictSet.matched))).toEqual({
			ops: [{ id: 'e1', date: '2026-09-04' }]
		});
		expect(built?.conflictSet.updatedAt).toBeInstanceOf(Date);
	});

	it('leaves a prior sample alone when no matches are provided', () => {
		const built = buildUnmatchedReport('bulk_edit', 'Move to Friday');
		expect(built?.values.matched).toBeUndefined();
		expect(built?.conflictSet.matched).toBeUndefined();
		expect(built?.conflictSet.sample).toBe('move to friday');
	});
});
