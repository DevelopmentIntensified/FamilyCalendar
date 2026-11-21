/**
 * Pure admin section rules: the two destinations' one home (order, hrefs,
 * labels, count keys, badge colours) and the active-path test.
 *
 * Expected values come from the legacy layout and index page, not from
 * running the code: `src/routes/(admin)/+layout.svelte:7-20,32-51` and
 * `src/routes/(admin)/admin/+page.svelte:13-41`.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { ADMIN_SECTIONS, isAdminSectionActive } from './admin.sections.rules';

describe('ADMIN_SECTIONS', () => {
	it('is the two registers, Bug Reports first', () => {
		expect(ADMIN_SECTIONS.map((section) => section.label)).toEqual([
			'Bug Reports',
			'Unmatched Phrases'
		]);
	});

	it('points at the two register routes the legacy layout and index page hard-coded', () => {
		expect(ADMIN_SECTIONS.map((section) => section.href)).toEqual(['/admin/bugs', '/admin/nlp']);
	});

	it('feeds each badge from its own open count', () => {
		expect(ADMIN_SECTIONS.map((section) => section.countKey)).toEqual(['openBugs', 'openPhrases']);
	});

	it('keeps the legacy badge colours: red for bugs, slate for phrases', () => {
		expect(ADMIN_SECTIONS.map((section) => section.badge)).toEqual([
			'bg-red-100 text-red-700',
			'bg-slate-200 text-slate-600'
		]);
	});
});

describe('isAdminSectionActive', () => {
	it.each<[string, boolean]>([
		['/admin/bugs', true],
		['/admin/bugs/42', true],
		['/admin', false],
		['/admin/nlp', false],
		['/admin/nlpx', false],
		['/adminx', false]
	])('marks a tab active on its exact path or a child: %j → %s', (pathname, expected) => {
		expect(isAdminSectionActive(pathname, '/admin/bugs')).toBe(expected);
	});

	it.each<[string, boolean]>([
		['/admin/nlp', true],
		['/admin/nlp/7', true],
		['/admin/bugs', false],
		['/admin/nlpx', false]
	])('marks the phrase tab active on its exact path or a child: %j → %s', (pathname, expected) => {
		expect(isAdminSectionActive(pathname, '/admin/nlp')).toBe(expected);
	});
});
