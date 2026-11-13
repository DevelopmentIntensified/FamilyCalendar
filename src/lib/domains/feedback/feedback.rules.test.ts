/**
 * Pure rules for feedback: the closed vocabularies, the phrase normalizer, the
 * auto-filing policy and the issue-257 reported-page normalizer. Expected
 * values come from the rule (README Invariants and the legacy pure tests it
 * cites), never from running the code.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import type { JsonValue } from '$lib/kernel/validation/validators';
import type { BugArea } from './feedback.contract';
import {
	areaForPath,
	BUG_AREA_LABEL,
	BUG_AREAS,
	bugAreaOf,
	bugReportDraft,
	buildAutoBugReport,
	isBugArea,
	isUnmatchedSource,
	normalizePhrase,
	reportBugHref,
	safeReportedPath,
	unmatchedPhraseUpsert,
	UNMATCHED_SOURCE_LABEL,
	UNMATCHED_SOURCES
} from './feedback.rules';
import type { AutoBugReportInput } from './feedback.rules';

const ORIGIN = 'https://test.familyplanz.com';

describe('closed vocabularies', () => {
	it('keeps the six bug areas in their wire order', () => {
		expect(BUG_AREAS).toEqual(['calendar', 'tasks', 'account', 'payments', 'dashboard', 'other']);
	});

	it('keeps the two unmatched sources', () => {
		expect(UNMATCHED_SOURCES).toEqual(['event_parse', 'bulk_edit']);
	});

	it('labels every area for the export text and the register chips', () => {
		expect(BUG_AREAS.map((area) => BUG_AREA_LABEL[area])).toEqual([
			'Calendar',
			'Tasks',
			'Account',
			'Payments',
			'Dashboard',
			'Other'
		]);
	});

	it('labels every source', () => {
		expect(UNMATCHED_SOURCES.map((source) => UNMATCHED_SOURCE_LABEL[source])).toEqual([
			'Event parse',
			'Bulk edit'
		]);
	});

	it.each<[string, boolean]>([
		['calendar', true],
		['other', true],
		['Tasks', false],
		['weather', false],
		['', false]
	])('isBugArea(%j) → %s', (area, expected) => {
		expect(isBugArea(area)).toBe(expected);
	});

	it.each<[string, boolean]>([
		['event_parse', true],
		['bulk_edit', true],
		['parser', false],
		['', false]
	])('isUnmatchedSource(%j) → %s', (source, expected) => {
		expect(isUnmatchedSource(source)).toBe(expected);
	});
});

describe('normalizePhrase', () => {
	// Legacy case, unmatchedPhrases.test.ts › "lowercases, collapses whitespace, trims, and caps length".
	it.each<[string, string]>([
		['  Lunch   FRIDAY ', 'lunch friday'],
		['A\tb\n\n c', 'a b c'],
		['   ', ''],
		['', '']
	])('normalizePhrase(%j) → %j', (phrase, expected) => {
		expect(normalizePhrase(phrase)).toBe(expected);
	});

	it('caps the normalized phrase at 280 characters', () => {
		expect(normalizePhrase('x'.repeat(300))).toHaveLength(280);
	});
});

describe('unmatchedPhraseUpsert', () => {
	it('returns null for a phrase that is blank after normalization', () => {
		expect(unmatchedPhraseUpsert('event_parse', '   ')).toBeNull();
	});

	it('normalizes the phrase and keeps a stringified sample', () => {
		// Legacy cases, unmatchedPhrases.test.ts › "packs values for insert with stringified matches".
		expect(
			unmatchedPhraseUpsert('event_parse', '  Launch   Sept 23 ', {
				title: 'Launch',
				date: '2026-09-23'
			})
		).toEqual({
			source: 'event_parse',
			phrase: 'launch sept 23',
			matched: '{"title":"Launch","date":"2026-09-23"}'
		});
	});

	it.each<[string, JsonValue | null | undefined, string | null]>([
		[
			'a nested sample',
			{ ops: [{ id: 'e1', date: '2026-09-04' }] },
			'{"ops":[{"id":"e1","date":"2026-09-04"}]}'
		],
		['an array sample', [{ id: 'e1' }], '[{"id":"e1"}]'],
		['zero', 0, null],
		['false', false, null],
		['an empty string', '', null],
		['null', null, null],
		['undefined', undefined, null]
	])('stores %s as %j (legacy `if (matched)`)', (_label, matched, expected) => {
		expect(unmatchedPhraseUpsert('bulk_edit', 'Move to Friday', matched)?.matched).toBe(expected);
	});
});

describe('bugAreaOf', () => {
	it('maps an unknown area to other', () => {
		expect(bugAreaOf('calendar')).toBe('calendar');
		expect(bugAreaOf('weather')).toBe('other');
		expect(bugAreaOf('Tasks')).toBe('other');
		expect(bugAreaOf('')).toBe('other');
	});
});

describe('bugReportDraft', () => {
	it('refuses a blank description', () => {
		expect(bugReportDraft({ area: 'tasks', description: '   ', url: null })).toBeNull();
	});

	it('trims the description and the url', () => {
		expect(
			bugReportDraft({ area: 'tasks', description: '  Row vanished  ', url: '  /calendar  ' })
		).toEqual({ area: 'tasks', description: 'Row vanished', url: '/calendar' });
	});

	it('maps an unknown area to other', () => {
		expect(bugReportDraft({ area: 'weather', description: 'x', url: null })?.area).toBe('other');
	});

	it('caps the description at 5000 and the url at 2000', () => {
		const draft = bugReportDraft({
			area: 'other',
			description: 'x'.repeat(6000),
			url: `/${'a'.repeat(2100)}`
		});
		expect(draft?.description).toHaveLength(5000);
		expect(draft?.url).toHaveLength(2000);
	});

	it.each<[string | null | undefined]>([[undefined], [null], ['   ']])(
		'stores a %j url as null',
		(url) => {
			expect(bugReportDraft({ area: 'tasks', description: 'x', url })?.url).toBeNull();
		}
	);
});

describe('maps paths to areas', () => {
	it.each<[string, BugArea]>([
		['/dashboard', 'dashboard'],
		['/calendar/dashboard', 'dashboard'],
		['/calendar', 'calendar'],
		['/calendar?view=week', 'calendar'],
		['/api/events/42', 'calendar'],
		['/tasks', 'tasks'],
		['/api/tasks', 'tasks'],
		['/account', 'account'],
		['/claim/abc', 'account'],
		['/login', 'account'],
		['/weird', 'other'],
		['/', 'other']
	])('areaForPath(%j) → %s', (path, expected) => {
		expect(areaForPath(path)).toBe(expected);
	});
});

describe('buildAutoBugReport', () => {
	it.each<[string, AutoBugReportInput]>([
		['a 404', { status: 404, message: 'Not found', path: '/nope' }],
		['an empty message', { status: 500, message: '  ', path: '/calendar' }]
	])('files nothing for %s', (_label, input) => {
		expect(buildAutoBugReport(input)).toBeNull();
	});

	// Legacy #049 table, autoBugReport.test.ts › "returns null for client-abort messages".
	it.each<[string]>([
		['aborted'],
		['AbortError: aborted'],
		['The operation was aborted'],
		['fetch aborted']
	])('files nothing for a client-abort message: %j', (message) => {
		expect(buildAutoBugReport({ status: 500, message, path: '/calendar' })).toBeNull();
	});

	it('prefixes the status and caps the description at 5000', () => {
		const report = buildAutoBugReport({
			status: 500,
			message: 'x'.repeat(6000),
			path: '/'
		});
		expect(report?.description.startsWith('[auto-filed 500] ')).toBe(true);
		expect(report?.description).toHaveLength(5000);
	});

	it.each<[string, BugArea]>([
		['/calendar/dashboard', 'dashboard'],
		['/calendar', 'calendar'],
		['/api/events', 'calendar'],
		['/tasks', 'tasks'],
		['/account', 'account'],
		['/weird', 'other']
	])('files %s under %s and records the path', (path, area) => {
		const report = buildAutoBugReport({ status: 500, message: 'boom', path });
		expect(report?.area).toBe(area);
		expect(report?.url).toBe(path);
	});

	it('caps the recorded path at 2000 and stores an empty one as null', () => {
		const long = buildAutoBugReport({
			status: 500,
			message: 'boom',
			path: `/${'a'.repeat(2100)}`
		});
		expect(long?.url).toHaveLength(2000);
		const blank = buildAutoBugReport({ status: 500, message: 'boom', path: '' });
		expect(blank?.url).toBeNull();
	});
});

describe('safeReportedPath (issue 257)', () => {
	// Legacy table, reportBug.test.ts › "safeReportedPath (issue 257)".
	it.each<[string | null | undefined, string | undefined, string]>([
		['/calendar/tasks', undefined, '/calendar/tasks'],
		['/calendar?view=week', undefined, '/calendar?view=week'],
		['  /account  ', undefined, '/account'],
		[`${ORIGIN}/calendar/tasks?x=1`, ORIGIN, '/calendar/tasks?x=1'],
		['https://evil.example/calendar', ORIGIN, ''],
		['//evil.example/x', ORIGIN, ''],
		['/\\evil.example', ORIGIN, ''],
		['javascript:alert(1)', ORIGIN, ''],
		['calendar', ORIGIN, ''],
		['/report-bug', undefined, ''],
		['/report-bug?from=%2Fcalendar', undefined, ''],
		[`${ORIGIN}/report-bug`, ORIGIN, ''],
		['', ORIGIN, ''],
		[null, ORIGIN, ''],
		[undefined, ORIGIN, '']
	])('safeReportedPath(%j, %j) → %j', (raw, origin, expected) => {
		expect(safeReportedPath(raw, origin)).toBe(expected);
	});

	it('caps the reported path at 500 chars', () => {
		expect(safeReportedPath(`/${'a'.repeat(900)}`)).toHaveLength(500);
	});
});

describe('reportBugHref (issue 257)', () => {
	it('carries the current path', () => {
		expect(reportBugHref('/calendar/tasks?tag=x')).toBe(
			'/report-bug?from=%2Fcalendar%2Ftasks%3Ftag%3Dx'
		);
	});

	it.each<[string | null | undefined]>([['/report-bug'], [null], [undefined], ['']])(
		'falls back to the bare form link for %j',
		(path) => {
			expect(reportBugHref(path)).toBe('/report-bug');
		}
	);
});
