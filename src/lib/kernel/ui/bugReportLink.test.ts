/**
 * The issue-257 "report this page" link and its `?from=` normalizer. Rows are
 * the legacy `reportBug.test.ts` table (`safeReportedPath`) and the two link
 * cases; they moved here from the feedback module when the chrome needed the
 * rule without feedback's date-carrying entry (ADR 0010).
 *
 * Doc: src/lib/kernel/README.md#ui
 */
import { describe, expect, it } from 'vitest';
import { reportBugHref, safeReportedPath } from './bugReportLink';

const ORIGIN = 'https://test.familyplanz.com';

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
