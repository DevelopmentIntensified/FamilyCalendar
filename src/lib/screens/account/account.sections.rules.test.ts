/**
 * The section list, its hash rule and its hrefs. Expected values are the
 * approved page's ten sections in their fixed order, read from the legacy
 * `src/lib/components/account/accountSections.ts` (moved here by the port).
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	ACCOUNT_SECTIONS,
	accountSectionHref,
	resolveAccountSection,
	type AccountSectionId
} from './account.sections.rules';

describe('ACCOUNT_SECTIONS', () => {
	it('keeps the ten approved sections in order', () => {
		expect(ACCOUNT_SECTIONS).toEqual([
			{ id: 'profile', label: 'Profile' },
			{ id: 'families', label: 'Your families' },
			{ id: 'notifications', label: 'Notifications' },
			{ id: 'calendar', label: 'Calendar' },
			{ id: 'dashboard', label: 'Dashboard' },
			{ id: 'subscription', label: 'Plan & usage' },
			{ id: 'email', label: 'Email' },
			{ id: 'security', label: 'Security' },
			{ id: 'api', label: 'API Tokens' },
			{ id: 'danger', label: 'Danger Zone' }
		]);
	});

	it('gives every section a unique id', () => {
		const ids = ACCOUNT_SECTIONS.map((section) => section.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe('resolveAccountSection', () => {
	// README Invariant: `account.sections.rules.test.ts › resolves a hash to its
	// section and falls back to the first`.
	it('resolves a hash to its section and falls back to the first', () => {
		expect(resolveAccountSection('#dashboard')).toBe('dashboard');
		expect(resolveAccountSection('#notifications')).toBe('notifications');
		expect(resolveAccountSection('')).toBe('profile');
		expect(resolveAccountSection('#meals')).toBe('profile');
	});

	// Legacy, AccountSidebar.svelte.test.ts › "renders the section a hash names".
	it.each<[string, AccountSectionId]>([
		['#profile', 'profile'],
		['#families', 'families'],
		['#notifications', 'notifications'],
		['#calendar', 'calendar'],
		['#dashboard', 'dashboard'],
		['#subscription', 'subscription'],
		['#email', 'email'],
		['#security', 'security'],
		['#api', 'api'],
		['#danger', 'danger']
	])('resolves %s to %s', (hash, expected) => {
		expect(resolveAccountSection(hash)).toBe(expected);
	});

	// Legacy stripped the first `#` only: a bare id is the same section.
	it('resolves a hash without the leading #', () => {
		expect(resolveAccountSection('calendar')).toBe('calendar');
	});

	// Legacy, AccountSidebar.svelte.test.ts › "falls back to the first section
	// rather than rendering nothing".
	it.each<[string]>([[''], ['#'], ['#meals'], ['#PROFILE'], ['##dashboard']])(
		'falls back to the first section for %j',
		(hash) => {
			expect(resolveAccountSection(hash)).toBe('profile');
		}
	);
});

describe('accountSectionHref', () => {
	it('links every section to its own hash', () => {
		for (const section of ACCOUNT_SECTIONS) {
			expect(accountSectionHref(section.id)).toBe(`#${section.id}`);
		}
	});

	it('links the calendar section as /calendar/settings redirects to it', () => {
		// Legacy, calendar/settings/+page.server.ts:5-7.
		expect(accountSectionHref('calendar')).toBe('#calendar');
	});
});
