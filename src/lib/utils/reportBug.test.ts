import { describe, it, expect } from 'vitest';
import { reportBugHref, safeReportedPath } from './reportBug';

const ORIGIN = 'https://test.familyplanz.com';

describe('safeReportedPath (issue 257)', () => {
	it.each([
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
	])('%s -> %s', (raw, origin, expected) => {
		expect(safeReportedPath(raw, origin)).toBe(expected);
	});

	it('caps length', () => {
		expect(safeReportedPath('/' + 'a'.repeat(900)).length).toBe(500);
	});
});

describe('reportBugHref (issue 257)', () => {
	it('carries the current path', () => {
		expect(reportBugHref('/calendar/tasks?tag=x')).toBe(
			'/report-bug?from=%2Fcalendar%2Ftasks%3Ftag%3Dx'
		);
	});
	it('falls back to the bare form link', () => {
		expect(reportBugHref('/report-bug')).toBe('/report-bug');
		expect(reportBugHref(undefined)).toBe('/report-bug');
	});
});
