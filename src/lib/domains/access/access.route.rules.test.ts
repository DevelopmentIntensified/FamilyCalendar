/**
 * The route gate, worked from the legacy list: a segment match, so a path that
 * merely contains a protected word passes, and every admin path is protected.
 * Expected values come from `src/hooks.server.ts:23-39` at the S2 sha.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { isAdminRoute, isProtectedRoute } from './access.route.rules';

describe('isProtectedRoute', () => {
	it.each<[string, boolean]>([
		['/calendar', true],
		['/calendar/2026-03-01', true],
		['/account', true],
		['/account/privacy', true],
		['/claim', true],
		['/claim/verify-token', true],
		['/admin', true],
		['/admin/bugs', true],
		// Legacy `matchesRoute` is a segment match: '/disclaimer' must not match
		// 'claim', and a substring is not a segment.
		['/disclaimer', false],
		['/my-calendar-notes', false],
		['/api/events', false],
		['/login', false],
		['/', false],
		['', false]
	])('%j → %s', (pathname, expected) => {
		expect(isProtectedRoute(pathname)).toBe(expected);
	});
});

describe('isAdminRoute', () => {
	it.each<[string, boolean]>([
		['/admin', true],
		['/admin/settings', true],
		['/api/admin/bugs', true],
		['/calendar', false],
		['/account', false],
		['/claim', false],
		['/administrator', false],
		['/', false]
	])('%j → %s', (pathname, expected) => {
		expect(isAdminRoute(pathname)).toBe(expected);
	});
});
