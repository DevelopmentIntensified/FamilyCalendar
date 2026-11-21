/**
 * The page's query-string contract: invalid values are IGNORED, never a 400,
 * and one junk param never takes a good neighbour with it. This is the schema
 * `parseCalendarUrl` reads; a page has no wire to pin beyond it.
 *
 * Doc: ./README.md#entry-url-and-the-opening-view
 */
import { describe, expect, it } from 'vitest';
import { calendarSearchParamsSchema } from './calendarPage.contract';

function parse(query: Record<string, string>) {
	return calendarSearchParamsSchema.parse(query);
}

describe('calendarSearchParamsSchema', () => {
	it('accepts an empty query — every param is optional', () => {
		const empty = calendarSearchParamsSchema.parse({});
		expect(empty.date).toBeUndefined();
		expect(empty.view).toBeUndefined();
		expect(empty.quickadd).toBeUndefined();
		expect(empty.title).toBeUndefined();
		expect(empty.text).toBeUndefined();
		expect(empty.url).toBeUndefined();
		expect(empty.edit).toBeUndefined();
		expect(empty.dashboardView).toBeUndefined();
	});

	it('keeps a real date and a known view', () => {
		expect(parse({ date: '2026-11-19', view: 'day' })).toMatchObject({
			date: '2026-11-19',
			view: 'day'
		});
		expect(parse({ date: '2024-02-29' }).date).toBe('2024-02-29');
	});

	it('ignores an impossible date or an unknown view, field by field', () => {
		expect(parse({ date: '2026-02-30' }).date).toBeUndefined();
		expect(parse({ date: '2026-1-1' }).date).toBeUndefined();
		expect(parse({ view: 'Month' }).view).toBeUndefined();
		expect(parse({ view: 'bogus' }).view).toBeUndefined();
		expect(parse({ date: 'nope', view: 'week' })).toMatchObject({
			date: undefined,
			view: 'week'
		});
	});

	it('carries the free-text and share-target params as strings', () => {
		expect(
			parse({
				quickadd: 'Piano Friday',
				title: 'Article',
				text: 'Read this',
				url: 'https://x.co/a1b2',
				edit: 'event-1',
				dashboardView: '1'
			})
		).toMatchObject({
			quickadd: 'Piano Friday',
			title: 'Article',
			text: 'Read this',
			url: 'https://x.co/a1b2',
			edit: 'event-1',
			dashboardView: '1'
		});
	});
});
