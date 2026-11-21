/**
 * The curated content: the fixed four-link nav, a changelog that is
 * newest-first and prints en-US UTC long dates, and a roadmap of exactly three
 * sections. Expected values come from the inventory in
 * `docs/rewrite/modules/marketing.md` and the pages' copy.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { formatLongDate } from '$lib/kernel/time/dates';
import {
	CHANGELOG_ENTRIES,
	MARKETING_NAV,
	ROADMAP_SECTIONS,
	changelogNewestFirst,
	marketingActiveHref,
	type ChangelogEntry
} from './marketing.content.rules';

describe('MARKETING_NAV', () => {
	it('the marketing nav is the fixed four links, in order', () => {
		expect(MARKETING_NAV).toEqual([
			{ href: '/features', label: 'Features' },
			{ href: '/pricing', label: 'Pricing' },
			{ href: '/about', label: 'About' },
			{ href: '/contact', label: 'Contact' }
		]);
	});
});

describe('marketingActiveHref', () => {
	it.each<[string, string | null]>([
		['/pricing', '/pricing'],
		['/pricing/compare', '/pricing'],
		['/features/', '/features'],
		['/pricingfoo', null],
		['/', null],
		['', null]
	])('%s → %s', (pathname, expected) => {
		expect(marketingActiveHref(pathname, MARKETING_NAV)).toBe(expected);
	});

	it('longest prefix wins, and an href’s query half is ignored', () => {
		const items = [
			{ href: '/calendar?dashboardView=1', label: 'Calendar' },
			{ href: '/calendar/tasks', label: 'Tasks' }
		];
		expect(marketingActiveHref('/calendar', items)).toBe('/calendar?dashboardView=1');
		expect(marketingActiveHref('/calendar/tasks/1', items)).toBe('/calendar/tasks');
		expect(marketingActiveHref('/calendar/archive', items)).toBe('/calendar?dashboardView=1');
	});
});

describe('the changelog', () => {
	const entry = (date: string, title: string): ChangelogEntry => ({
		date,
		title,
		description: `${title}.`
	});

	it('changelog is newest first', () => {
		expect(changelogNewestFirst(CHANGELOG_ENTRIES)).toEqual(CHANGELOG_ENTRIES);
		const dates = CHANGELOG_ENTRIES.map((e) => e.date);
		expect(dates).toEqual([...dates].sort().reverse());
	});

	it('sorts an unordered list newest first', () => {
		const sorted = changelogNewestFirst([
			entry('2026-08-01', 'old'),
			entry('2026-10-15', 'newest'),
			entry('2026-09-07', 'middle')
		]);
		expect(sorted.map((e) => e.title)).toEqual(['newest', 'middle', 'old']);
	});

	it('keeps the written order for entries that share a date', () => {
		const sorted = changelogNewestFirst([
			entry('2026-09-06', 'first written'),
			entry('2026-09-07', 'later day'),
			entry('2026-09-06', 'second written'),
			entry('2026-09-06', 'third written')
		]);
		expect(sorted.map((e) => e.title)).toEqual([
			'later day',
			'first written',
			'second written',
			'third written'
		]);
	});

	it('returns a new array and leaves its input alone', () => {
		const input = [entry('2026-01-01', 'a'), entry('2026-02-01', 'b')];
		const sorted = changelogNewestFirst(input);
		expect(sorted).not.toBe(input);
		expect(input.map((e) => e.title)).toEqual(['a', 'b']);
	});

	it('has an empty list for an empty changelog', () => {
		expect(changelogNewestFirst([])).toEqual([]);
	});

	it('titles are unique: the page keys its list by title', () => {
		const titles = CHANGELOG_ENTRIES.map((e) => e.title);
		expect(new Set(titles).size).toBe(titles.length);
	});

	it.each(CHANGELOG_ENTRIES.map((e) => [e.date, e.title] as const))(
		'%s "%s" is a real calendar day',
		(date) => {
			expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(formatLongDate(date, 'UTC')).not.toBe('');
		}
	);

	it.each([
		{ date: '2026-09-07', printed: 'September 7, 2026' },
		{ date: '2026-09-06', printed: 'September 6, 2026' },
		{ date: '2026-12-31', printed: 'December 31, 2026' },
		{ date: '2026-01-01', printed: 'January 1, 2026' }
	])('prints $date as the en-US long date $printed', ({ date, printed }) => {
		expect(formatLongDate(date, 'UTC')).toBe(printed);
	});
});

describe('the roadmap', () => {
	it('roadmap has exactly the three sections in order', () => {
		expect(ROADMAP_SECTIONS.map((s) => [s.id, s.heading])).toEqual([
			['shipped', 'Shipped'],
			['in-progress', 'In progress'],
			['coming-next', 'Coming next']
		]);
	});

	it('items have a title and a description each', () => {
		const items = ROADMAP_SECTIONS.flatMap((s) => s.items);
		expect(items.length).toBeGreaterThan(0);
		for (const item of items) {
			expect(item.title).not.toBe('');
			expect(item.description).not.toBe('');
		}
	});
});
