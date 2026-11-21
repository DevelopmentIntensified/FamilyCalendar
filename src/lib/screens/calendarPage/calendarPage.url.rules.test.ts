/**
 * Pure URL rules: the deep-link seeds, the Dashboard redirect, the share-target
 * text, the create seed and `?edit=` resolution. Expected values come from the
 * legacy page (`src/routes/(calendar)/calendar/+page.svelte:89-107,333-356,506-521`),
 * `src/routes/share-target/+page.server.ts` and their tests, and the README
 * Invariants — never from running this code.
 *
 * Doc: ./README.md#entry-url-and-the-opening-view
 */
import { describe, expect, it } from 'vitest';
import {
	CALENDAR_EDIT_NOT_FOUND,
	CALENDAR_SHARED_TEXT_NOTE,
	createSeedFromUrl,
	dashboardRedirect,
	parseCalendarUrl,
	resolveCalendarEditLink,
	shareTargetText
} from './calendarPage.url.rules';

function params(query: string): URLSearchParams {
	return new URLSearchParams(query);
}

describe('parseCalendarUrl', () => {
	it('reads only a real date and a known view', () => {
		expect(parseCalendarUrl(params('date=2026-11-19&view=day'))).toMatchObject({
			date: '2026-11-19',
			view: 'day'
		});
		expect(parseCalendarUrl(params('date=2026-02-30'))).toMatchObject({ date: null });
		expect(parseCalendarUrl(params('date=2026-13-01'))).toMatchObject({ date: null });
		expect(parseCalendarUrl(params('date=2026-1-1'))).toMatchObject({ date: null });
		expect(parseCalendarUrl(params('date=tomorrow'))).toMatchObject({ date: null });
		expect(parseCalendarUrl(params('view=Month'))).toMatchObject({ view: null });
		expect(parseCalendarUrl(params('view=bogus'))).toMatchObject({ view: null });
	});

	it('applies a good param even when its neighbour is junk — never half-applied', () => {
		expect(parseCalendarUrl(params('date=nope&view=week'))).toMatchObject({
			date: null,
			view: 'week'
		});
		expect(parseCalendarUrl(params('date=2026-11-19&view=nope'))).toMatchObject({
			date: '2026-11-19',
			view: null
		});
	});

	it('treats an absent param as null and a present-but-empty edit as no link', () => {
		expect(parseCalendarUrl(params(''))).toMatchObject({
			date: null,
			view: null,
			edit: null,
			quickadd: null,
			dashboardView: false
		});
		expect(parseCalendarUrl(params('edit=&quickadd=  ')).edit).toBeNull();
		expect(parseCalendarUrl(params('edit=&quickadd=  ')).quickadd).toBeNull();
	});

	it('keeps the share-target params raw for the fold rule', () => {
		expect(
			parseCalendarUrl(params('title=Article&text=Read%20this&url=https%3A%2F%2Fx.co%2Fa1b2'))
		).toMatchObject({ title: 'Article', text: 'Read this', url: 'https://x.co/a1b2' });
	});

	it('reads dashboardView by presence, never by value', () => {
		expect(parseCalendarUrl(params('dashboardView')).dashboardView).toBe(true);
		expect(parseCalendarUrl(params('dashboardView=0')).dashboardView).toBe(true);
		expect(parseCalendarUrl(params('')).dashboardView).toBe(false);
	});
});

describe('dashboardRedirect (#056)', () => {
	it('a Dashboard default redirects unless the URL says otherwise', () => {
		expect(dashboardRedirect(params(''), 'dashboard')).toBe('/calendar/dashboard');
		expect(dashboardRedirect(params(''), 'dayView')).toBeNull();
		expect(dashboardRedirect(params(''), null)).toBeNull();
	});

	it('lets a Dashboard person through with ?dashboardView, ?view or ?date', () => {
		expect(dashboardRedirect(params('dashboardView=1'), 'dashboard')).toBeNull();
		expect(dashboardRedirect(params('view=week'), 'dashboard')).toBeNull();
		expect(dashboardRedirect(params('date=2026-11-19'), 'dashboard')).toBeNull();
	});

	it('bypasses on a param being present, even when its value is junk', () => {
		// Today's behaviour: `?view=bogus` reaches the page and the invalid view
		// is ignored there, rather than redirecting to the dashboard.
		expect(dashboardRedirect(params('view=bogus'), 'dashboard')).toBeNull();
		expect(dashboardRedirect(params('date=nope'), 'dashboard')).toBeNull();
	});
});

// Issue 027 — PWA share target. On Android the `url` param is always empty;
// shared URLs arrive embedded in `text` (sometimes `title`), so the builder
// must never duplicate a URL already in the text blob.
describe('shareTargetText', () => {
	it('prefers text over title', () => {
		expect(shareTargetText('A link', 'soccer practice saturday 10am', '')).toBe(
			'soccer practice saturday 10am'
		);
	});

	it('folds text, else the title, then the link', () => {
		expect(shareTargetText('Soccer practice Saturday 10am', '', '')).toBe(
			'Soccer practice Saturday 10am'
		);
		expect(shareTargetText('Article', 'Read this tonight', 'https://x.co/a1b2')).toBe(
			'Read this tonight https://x.co/a1b2'
		);
	});

	it('does not duplicate a URL already embedded in the text (Android)', () => {
		const text = 'on for saturday 10am? https://m.me/r/abc123 with the schedule';
		expect(shareTargetText('Messenger chat', text, '')).toBe(text);
		expect(shareTargetText('Messenger chat', text, 'https://m.me/r/abc123')).toBe(text);
	});

	it('does not duplicate a URL embedded with surrounding punctuation', () => {
		const text = 'check this out: https://x.co/a1b2, pretty great';
		expect(shareTargetText('', text, 'https://x.co/a1b2')).toBe(text);
	});

	it('uses the url param alone when text and title are empty', () => {
		expect(shareTargetText('', '', 'https://x.co/a1b2')).toBe('https://x.co/a1b2');
	});

	it('returns an empty string when every param is empty/blank', () => {
		expect(shareTargetText('', '', '')).toBe('');
		expect(shareTargetText('   ', '   ', '')).toBe('');
	});

	it('collapses newlines kept from long shared messages into spaces', () => {
		expect(shareTargetText('', 'dinner friday\nat 7pm', '')).toBe('dinner friday at 7pm');
	});
});

describe('createSeedFromUrl', () => {
	it('seeds Quick Add from the share-target params, with the ack', () => {
		expect(createSeedFromUrl(params('title=Article&text=Read%20this&url=https%3A%2F%2Fx.co%2Fa1b2'))).toEqual(
			{ quickAdd: 'Read this https://x.co/a1b2', note: CALENDAR_SHARED_TEXT_NOTE }
		);
	});

	it('falls back to ?quickadd= when no share params are present', () => {
		expect(createSeedFromUrl(params('quickadd=Piano%20lesson%20Friday'))).toEqual({
			quickAdd: 'Piano lesson Friday',
			note: CALENDAR_SHARED_TEXT_NOTE
		});
	});

	it('prefers the share params over ?quickadd=, as the legacy fold did', () => {
		expect(createSeedFromUrl(params('quickadd=ignored&text=shared'))).toEqual({
			quickAdd: 'shared',
			note: CALENDAR_SHARED_TEXT_NOTE
		});
	});

	it('seeds nothing when the text is blank', () => {
		expect(createSeedFromUrl(params(''))).toBeNull();
		expect(createSeedFromUrl(params('quickadd=%20%20'))).toBeNull();
		expect(createSeedFromUrl(params('title=%20&text=%20&url=%20'))).toBeNull();
	});
});

describe('resolveCalendarEditLink (?edit=, Q-100)', () => {
	const rows = [
		{ id: 'event-1', masterId: null },
		{ id: 'event-2~2026-11-19T09:00:00.000Z', masterId: 'event-2' },
		{ id: 'event-3' }
	];

	it('finds a one-off by its id, and a recurring occurrence by its master id', () => {
		expect(resolveCalendarEditLink('event-1', rows)).toEqual(rows[0]);
		expect(resolveCalendarEditLink('event-2', rows)).toEqual(rows[1]);
		expect(resolveCalendarEditLink('event-2~2026-11-19T09:00:00.000Z', rows)).toEqual(rows[1]);
	});

	it('fails outside the loaded window — the banner is the answer (Q-100)', () => {
		expect(resolveCalendarEditLink('event-next-year', rows)).toBeNull();
		expect(resolveCalendarEditLink('', rows)).toBeNull();
		expect(resolveCalendarEditLink(null, rows)).toBeNull();
		expect(resolveCalendarEditLink(undefined, rows)).toBeNull();
	});

	it('does not match a near id or a prefix', () => {
		expect(resolveCalendarEditLink('event-', rows)).toBeNull();
		expect(resolveCalendarEditLink('event-1-extra', rows)).toBeNull();
	});

	it('carries the legacy not-found copy verbatim', () => {
		expect(CALENDAR_EDIT_NOT_FOUND).toBe(
			"Event not found — it may have been deleted, or you don't have access to it."
		);
	});
});
