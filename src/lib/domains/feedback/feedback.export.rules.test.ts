/**
 * The agent-ready export text: the two registers, their headers and grouping,
 * the matched-sample reduction and the reporter fallback. Dates come from
 * `kernel/time`, so the expected strings are plain copies of the legacy
 * output (no formatter of our own).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import type { BugReportWithReporter, UnmatchedPhraseView } from './feedback.contract';
import {
	formatBugReportsExport,
	formatUnmatchedPhrasesExport,
	matchedSummary,
	reporterName
} from './feedback.export.rules';

const NOW = new Date('2026-09-01T10:30:00Z');
const ZONE = 'UTC';
const RULE = '='.repeat(60);

function phrase(overrides: Partial<UnmatchedPhraseView> = {}): UnmatchedPhraseView {
	return {
		id: 'p1',
		source: 'event_parse',
		phrase: 'piano after school',
		sample: 'piano after school',
		matched: null,
		count: 1,
		resolved: false,
		createdAt: new Date('2026-08-20T10:00:00Z'),
		updatedAt: new Date('2026-08-20T10:00:00Z'),
		...overrides
	};
}

function report(overrides: Partial<BugReportWithReporter> = {}): BugReportWithReporter {
	return {
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
		...overrides
	};
}

describe('matchedSummary', () => {
	// Legacy, export.test.ts › matchedSummary.
	it.each<[string, string | null, Record<string, string | number | boolean> | null]>([
		['missing', null, null],
		['invalid JSON', 'not json', null],
		['a JSON scalar', '"just text"', null],
		['nothing populated', JSON.stringify({ a: null, b: '', c: false, d: [] }), null],
		[
			'dropping empty fields',
			JSON.stringify({ title: 'Lunch', date: '', startTime: '12:00', allDay: false, tags: [] }),
			{ title: 'Lunch', startTime: '12:00' }
		],
		[
			'keeping zero and stringifying nested values',
			JSON.stringify({ count: 0, guests: [{ name: 'John' }] }),
			{ count: 0, guests: '[{"name":"John"}]' }
		]
	])('returns the populated scalars for %s', (_label, matched, expected) => {
		expect(matchedSummary(matched)).toEqual(expected);
	});
});

describe('reporterName', () => {
	// Legacy, export.test.ts › reporterName.
	it.each<[string | null, string | null, string]>([
		['Jane', 'Doe', 'Jane Doe'],
		['Sam', null, 'Sam'],
		[null, 'Ng', 'Ng'],
		[null, null, 'Anonymous / deleted'],
		['', '', 'Anonymous / deleted']
	])('reporterName(%j, %j) → %j', (reporterFirstName, reporterLastName, expected) => {
		expect(reporterName({ reporterFirstName, reporterLastName })).toBe(expected);
	});
});

describe('formatBugReportsExport', () => {
	it('renders the header, the open count and the rows it is given', () => {
		const text = formatBugReportsExport(
			[
				report({
					id: 'b2',
					userId: null,
					area: 'calendar',
					description: 'Event disappeared\nwhen I saved.',
					url: null,
					createdAt: new Date('2026-03-02T09:00:00Z')
				}),
				report({
					id: 'b1',
					area: 'tasks',
					description: 'Row vanished',
					url: '/calendar/tasks',
					createdAt: new Date('2026-03-01T09:00:00Z')
				})
			],
			NOW,
			ZONE
		);
		expect(text).toBe(
			[
				'BUG REPORTS EXPORT',
				'Generated: 2026-09-01 10:30',
				'User-submitted bug reports, newest first.',
				'',
				'Open: 2',
				RULE,
				'',
				'## Open',
				'- [Calendar] Event disappeared when I saved.  (page: n/a · 2026-03-02 09:00)',
				'- [Tasks] Row vanished  (page: /calendar/tasks · 2026-03-01 09:00)',
				''
			].join('\n')
		);
	});

	it('prints the header and Open: 0 for an empty register', () => {
		expect(formatBugReportsExport([], NOW, ZONE)).toBe(
			[
				'BUG REPORTS EXPORT',
				'Generated: 2026-09-01 10:30',
				'User-submitted bug reports, newest first.',
				'',
				'Open: 0',
				RULE,
				''
			].join('\n')
		);
	});

	it('never prints a reporter name', () => {
		const text = formatBugReportsExport([report()], NOW, ZONE);
		expect(text).not.toContain('Jane Doe');
		expect(text).not.toContain('by ');
	});

	it('falls back to the raw area when the row holds one outside the vocabulary', () => {
		expect(formatBugReportsExport([report({ area: 'weather' })], NOW, ZONE)).toContain(
			'- [weather] Event disappeared when I saved.'
		);
	});

	it('prints dates in the zone it is given', () => {
		const text = formatBugReportsExport([report()], NOW, 'America/New_York');
		expect(text).toContain('Generated: 2026-09-01 06:30');
	});
});

describe('formatUnmatchedPhrasesExport', () => {
	it('renders the header, the totals and the source groups', () => {
		const text = formatUnmatchedPhrasesExport(
			[
				phrase({
					id: 'p2',
					phrase: 'book dentist',
					sample: 'book dentist',
					matched: '{"title":"Book dentist"}',
					count: 3,
					createdAt: new Date('2026-03-01T09:00:00Z')
				}),
				phrase({
					id: 'p1',
					phrase: 'call mom',
					sample: 'call mom',
					count: 1,
					createdAt: new Date('2026-03-02T09:00:00Z')
				}),
				phrase({
					id: 'p3',
					source: 'bulk_edit',
					phrase: 'every tuesday',
					sample: 'every tuesday',
					count: 5,
					createdAt: new Date('2026-02-01T09:00:00Z')
				})
			],
			NOW,
			ZONE
		);
		expect(text).toBe(
			[
				'UNMATCHED PHRASES EXPORT',
				'Generated: 2026-09-01 10:30',
				'Instructions the natural-language parsers could not handle.',
				'',
				'Open: 3 unique (9 occurrences)',
				RULE,
				'',
				'## Event parse (2)',
				'- "book dentist" — 3x, first seen 2026-03-01 matched: {"title":"Book dentist"}',
				'- "call mom" — 1x, first seen 2026-03-02',
				'',
				'## Bulk edit (1)',
				'- "every tuesday" — 5x, first seen 2026-02-01',
				''
			].join('\n')
		);
	});

	it('prints the header and Open: 0 unique (0 occurrences) for an empty register', () => {
		expect(formatUnmatchedPhrasesExport([], NOW, ZONE)).toBe(
			[
				'UNMATCHED PHRASES EXPORT',
				'Generated: 2026-09-01 10:30',
				'Instructions the natural-language parsers could not handle.',
				'',
				'Open: 0 unique (0 occurrences)',
				RULE,
				''
			].join('\n')
		);
	});

	it('never prints a Resolved section', () => {
		const text = formatUnmatchedPhrasesExport([phrase()], NOW, ZONE);
		expect(text).not.toContain('Resolved');
	});

	it('falls back to the raw source when a row holds one outside the vocabulary', () => {
		expect(formatUnmatchedPhrasesExport([phrase({ source: 'other_parser' })], NOW, ZONE)).toContain(
			'## other_parser (1)'
		);
	});

	it('prints dates in the zone it is given', () => {
		const text = formatUnmatchedPhrasesExport([phrase()], NOW, 'Pacific/Kiritimati');
		// 2026-09-01T10:30Z is 2026-09-02 00:30 in UTC+14.
		expect(text).toContain('Generated: 2026-09-02 00:30');
	});

	it('prints first seen in the zone it is given', () => {
		const text = formatUnmatchedPhrasesExport(
			[phrase({ createdAt: new Date('2026-03-02T02:00:00Z') })],
			NOW,
			'America/New_York'
		);
		// 02:00Z on 2 March is still 1 March in New York (EST, UTC-5).
		expect(text).toContain('first seen 2026-03-01');
	});
});
