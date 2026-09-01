import { describe, it, expect } from 'vitest';
import {
	formatUnmatchedPhrasesExport,
	formatBugReportsExport,
	reporterName,
	BUG_AREA_LABEL
} from './export';

describe('reporterName', () => {
	it('joins first and last name', () => {
		expect(reporterName({ reporterFirstName: 'Jane', reporterLastName: 'Doe' })).toBe('Jane Doe');
	});

	it('falls back when both names are null', () => {
		expect(reporterName({ reporterFirstName: null, reporterLastName: null })).toBe(
			'Anonymous / deleted'
		);
	});

	it('falls back when only the first name is present', () => {
		expect(reporterName({ reporterFirstName: 'Sam', reporterLastName: null })).toBe('Sam');
	});
});

describe('formatUnmatchedPhrasesExport', () => {
	const phrase = (
		over: Partial<{ id: string; source: string; phrase: string; count: number }> = {}
	) => ({
		id: 'p1',
		source: 'event_parse',
		phrase: 'gro\xc2\xa0cery run',
		count: 1,
		sample: 'gro\xc2\xa0cery run',
		resolved: false,
		createdAt: new Date('2026-08-20T10:00:00Z'),
		updatedAt: new Date('2026-08-20T10:00:00Z'),
		...over
	});

	it('includes headers and counts', () => {
		const text = formatUnmatchedPhrasesExport([phrase({ count: 5 })], []);
		expect(text).toContain('UNMATCHED PHRASES EXPORT');
		expect(text).toContain('Open: 1 unique (5 occurrences)');
		expect(text).toContain('Resolved: 0');
	});

	it('groups by source with a frequency tag per phrase', () => {
		const text = formatUnmatchedPhrasesExport(
			[
				phrase({ source: 'event_parse', phrase: 'piano after school', count: 3 }),
				phrase({ id: 'p2', source: 'bulk_edit', phrase: 'every tuesday', count: 1 })
			],
			[]
		);
		expect(text).toContain('## Event parse (1)');
		expect(text).toContain('## Bulk edit (1)');
		expect(text).toContain('"piano after school" — 3x');
	});

	it('lists resolved separately', () => {
		const text = formatUnmatchedPhrasesExport([], [phrase({ phrase: 'sunday brunch', count: 2 })]);
		expect(text).toContain('## Resolved');
		expect(text).toContain('"sunday brunch" — 2x');
	});
});

describe('formatBugReportsExport', () => {
	const report = (over: Partial<Record<string, unknown>> = {}) => ({
		id: 'b1',
		userId: 'u1',
		area: 'calendar',
		description: 'Event disappeared\nwhen I saved.',
		url: '/calendar',
		status: 'open',
		resolvedAt: null,
		createdAt: new Date('2026-08-31T12:00:00Z'),
		updatedAt: new Date('2026-08-31T12:00:00Z'),
		reporterFirstName: 'Jane',
		reporterLastName: 'Doe',
		...over
	});

	it('includes headers and counts', () => {
		const text = formatBugReportsExport([report()], []);
		expect(text).toContain('BUG REPORTS EXPORT');
		expect(text).toContain('Open: 1');
		expect(text).toContain('Resolved: 0');
	});

	it('renders area label, reporter, page and collapsed description', () => {
		const text = formatBugReportsExport([report()], []);
		expect(text).toContain(`[${BUG_AREA_LABEL.calendar}] Event disappeared when I saved.`);
		expect(text).toContain('by Jane Doe');
		expect(text).toContain('page: /calendar');
	});

	it('lists resolved reports under a Resolved heading', () => {
		const text = formatBugReportsExport(
			[],
			[report({ status: 'resolved', resolvedAt: new Date() })]
		);
		expect(text).toContain('## Resolved');
	});
});
