import { describe, it, expect } from 'vitest';
import { safeRedirectPath } from './safeRedirect';

describe('safeRedirectPath (#244) — same-origin relative paths only', () => {
	it.each([
		['/family/join/ABC123', '/family/join/ABC123'],
		['/checkout', '/checkout'],
		['/calendar?date=2026-11-01#today', '/calendar?date=2026-11-01#today'],
		['/', '/']
	])('keeps %s', (raw, expected) => {
		expect(safeRedirectPath(raw)).toBe(expected);
	});

	it.each([
		[null],
		[undefined],
		[''],
		['   '],
		['calendar'],
		['//evil.com'],
		['//evil.com/path'],
		['/\\evil.com'],
		['\\\\evil.com'],
		['/\\/evil.com'],
		['https://evil.com'],
		['http://test.com/calendar'],
		['javascript:alert(1)'],
		['/%0d%0aSet-Cookie:x'],
		['/\tevil'],
		['/\n/evil.com'],
		[' //evil.com']
	])('rejects %j -> fallback', (raw) => {
		expect(safeRedirectPath(raw)).toBe('/calendar');
	});

	it('uses the given fallback', () => {
		expect(safeRedirectPath('//evil.com', '/home')).toBe('/home');
	});
});
