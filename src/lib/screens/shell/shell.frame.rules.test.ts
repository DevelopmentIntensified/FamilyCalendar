/**
 * Pure frame rules: chrome mode per route group, the `<main>` banner offset
 * and the on-screen-keyboard test. Expected values come from the legacy render
 * sites — `(calendar)/calendar/+layout.svelte:89-94,139-148,266-269`,
 * `(family)/+layout.svelte:18-28` — and `BottomNav.svelte:88-118`.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { shellBannerOffset, shellChromeForRoute, shellIsKeyboardOpen } from './shell.frame.rules';

describe('gives the app chrome to the calendar and family groups only', () => {
	it.each<{ what: string; routeId: string | null; expected: 'app' | 'none' }>([
		{ what: 'the calendar group root', routeId: '/(calendar)/calendar', expected: 'app' },
		{ what: 'a calendar page', routeId: '/(calendar)/calendar/tasks', expected: 'app' },
		{ what: 'a calendar detail page', routeId: '/(calendar)/calendar/tasks/[id]', expected: 'app' },
		{ what: 'the family group root', routeId: '/(family)', expected: 'app' },
		{ what: 'a family page', routeId: '/(family)/family', expected: 'app' },
		{ what: 'a family member page', routeId: '/(family)/family/[id]', expected: 'app' },
		{ what: 'the account subtree (Q-073)', routeId: '/(calendar)/account', expected: 'app' },
		{ what: 'an account section', routeId: '/(calendar)/account/verify-email', expected: 'app' },
		{ what: 'a marketing page', routeId: '/(marketing)/pricing', expected: 'none' },
		{ what: 'the marketing group root', routeId: '/(marketing)', expected: 'none' },
		{ what: 'an admin page', routeId: '/(admin)/admin/users', expected: 'none' },
		{ what: 'the bug form', routeId: '/report-bug', expected: 'none' },
		{ what: 'the share target', routeId: '/share-target', expected: 'none' },
		{ what: 'the claim page', routeId: '/(calendar)/claim', expected: 'none' },
		{ what: 'the merge-guest page', routeId: '/(calendar)/merge-guest', expected: 'none' },
		{ what: 'a lookalike calendar id', routeId: '/(calendar)/calendarfoo', expected: 'none' },
		{ what: 'a lookalike family id', routeId: '/(family)x', expected: 'none' },
		{ what: 'a 404 with no route id', routeId: null, expected: 'none' },
		{ what: 'an empty route id', routeId: '', expected: 'none' }
	])('$what', ({ routeId, expected }) => {
		expect(shellChromeForRoute(routeId)).toBe(expected);
	});
});

describe('falls back to a 40 px line before the first measurement', () => {
	it.each<{ what: string; measuredHeight: number; bannerCount: number; expected: number }>([
		{ what: 'no banner', measuredHeight: 0, bannerCount: 0, expected: 0 },
		{ what: 'one banner, not measured yet', measuredHeight: 0, bannerCount: 1, expected: 40 },
		{
			what: 'two banners, not measured yet',
			measuredHeight: 0,
			bannerCount: 2,
			expected: 40
		},
		{ what: 'one measured banner', measuredHeight: 56, bannerCount: 1, expected: 56 },
		{ what: 'a measured wrapped stack', measuredHeight: 132, bannerCount: 2, expected: 132 },
		{ what: 'a measured stack after its banner left', measuredHeight: 132, bannerCount: 0, expected: 132 }
	])('$what', ({ measuredHeight, bannerCount, expected }) => {
		expect(shellBannerOffset(measuredHeight, bannerCount)).toBe(expected);
	});
});

describe('hides the tab bar above a 150 px keyboard inset', () => {
	it.each<{ what: string; innerHeight: number; viewportHeight: number | null; expected: boolean }>([
		{ what: 'no visual viewport (SSR)', innerHeight: 800, viewportHeight: null, expected: false },
		{ what: 'no inner height yet', innerHeight: 0, viewportHeight: 0, expected: false },
		{
			what: 'exactly at the 150 px threshold',
			innerHeight: 800,
			viewportHeight: 650,
			expected: false
		},
		{
			what: 'one pixel past the threshold',
			innerHeight: 800,
			viewportHeight: 649,
			expected: true
		},
		{ what: 'a phone keyboard', innerHeight: 700, viewportHeight: 400, expected: true },
		{ what: 'a taller phone, keyboard closed', innerHeight: 700, viewportHeight: 700, expected: false }
	])('$what', ({ innerHeight, viewportHeight, expected }) => {
		expect(shellIsKeyboardOpen(innerHeight, viewportHeight)).toBe(expected);
	});
});
