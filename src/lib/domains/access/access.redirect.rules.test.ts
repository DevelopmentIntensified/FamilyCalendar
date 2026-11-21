/**
 * Pure redirect rules for access: the post-auth `?redirect=` sanitiser. The
 * table is the legacy `safeRedirectPath` contract
 * (`src/lib/utils/safeRedirect.ts:7-19`, `safeRedirect.test.ts:5-39`) plus the
 * email-link fallback (`magicLink.ts:46-57`).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	authRedirectTarget,
	CALENDAR_LANDING_PATH,
	EMAIL_LINK_LANDING_PATH,
	emailLinkRedirectPath
} from './access.redirect.rules';

describe('authRedirectTarget — same-origin relative paths only', () => {
	it.each<[string, string]>([
		['/family/join/ABC123', '/family/join/ABC123'],
		['/checkout', '/checkout'],
		['/calendar?date=2026-11-01#today', '/calendar?date=2026-11-01#today'],
		['/', '/']
	])('keeps %s', (raw, expected) => {
		expect(authRedirectTarget(raw)).toBe(expected);
	});

	it.each<[unknown]>([
		[null],
		[undefined],
		[42],
		[{}],
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
	])('rejects %j -> the calendar fallback', (raw) => {
		expect(authRedirectTarget(raw)).toBe('/calendar');
	});

	it('drops an unsafe redirectTo', () => {
		expect(authRedirectTarget('/\\evil.com')).toBe('/calendar');
		expect(authRedirectTarget('//evil.com')).toBe('/calendar');
		expect(authRedirectTarget('https://evil.com')).toBe('/calendar');
	});

	it('uses the given fallback', () => {
		expect(authRedirectTarget('//evil.com', '/home')).toBe('/home');
	});

	it('keeps the two landing paths apart', () => {
		expect(CALENDAR_LANDING_PATH).toBe('/calendar');
		expect(EMAIL_LINK_LANDING_PATH).toBe('/calendar/');
	});
});

describe('emailLinkRedirectPath', () => {
	it('falls back to /calendar/ for a link issued without a usable target', () => {
		expect(emailLinkRedirectPath(undefined)).toBe('/calendar/');
		expect(emailLinkRedirectPath('//evil.com')).toBe('/calendar/');
	});

	it('keeps a safe signed target as a path', () => {
		expect(emailLinkRedirectPath('/family/join/ABC123?from=email')).toBe(
			'/family/join/ABC123?from=email'
		);
	});
});
