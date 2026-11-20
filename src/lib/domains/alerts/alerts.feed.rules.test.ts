/**
 * Pure rules for the feed: the one page size, the three filter chips, the two
 * sections and the chip counts over the whole loaded feed. Carried over from
 * `src/lib/utils/notificationTypes.test.ts` (cases named inline); expected
 * values come from the README Invariants.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	ALERT_FILTERS,
	ALERT_PAGE_SIZE,
	alertCounts,
	filterAlerts,
	groupAlerts
} from './alerts.feed.rules';
import type { AlertFilter, AlertRow } from './alerts.contract';

const READ_AT = '2026-09-30 10:00:00+00';

function aRow(over: Partial<AlertRow> = {}): AlertRow {
	return {
		id: 'n1',
		type: 'task_completed',
		rawType: 'task_completed',
		group: 'news',
		actorName: 'Sarah',
		message: 'completed "Weekly meal plan"',
		link: '/calendar/tasks',
		readAt: null,
		createdAt: '2026-09-30T09:00:00.000Z',
		...over
	};
}

/** A decision Alert: the two asking types are the needs-you group. */
function aNeedsYouRow(over: Partial<AlertRow> = {}): AlertRow {
	return aRow({
		type: 'assignment_pending',
		rawType: 'assignment_pending',
		group: 'needs_you',
		...over
	});
}

describe('the feed window', () => {
	// Invariant: one feed, one page size, shared by the bell API and the Alerts page.
	it('reads 50 rows', () => {
		expect(ALERT_PAGE_SIZE).toBe(50);
	});

	it('keeps the three chips in the order the toolbar renders them', () => {
		expect(ALERT_FILTERS).toEqual(['all', 'needs_you', 'unread']);
	});
});

describe('filterAlerts', () => {
	const rows = [
		aNeedsYouRow({ id: 'a' }),
		aRow({ id: 'b' }),
		aNeedsYouRow({
			id: 'c',
			type: 'assignment_declined',
			rawType: 'assignment_declined',
			readAt: READ_AT
		})
	];

	// notificationTypes.test.ts:160,164,168 "all keeps every row in source order", "needs_you keeps only the two decision types", "unread drops anything already read"
	it.each<[AlertFilter, string[]]>([
		['all', ['a', 'b', 'c']],
		['needs_you', ['a', 'c']],
		['unread', ['a', 'b']]
	])('%s keeps %j, in source order', (filter, ids) => {
		expect(filterAlerts(rows, filter).map((row) => row.id)).toEqual(ids);
	});

	it('answers an empty feed for every chip', () => {
		for (const filter of ALERT_FILTERS) expect(filterAlerts([], filter)).toEqual([]);
	});

	it('never hands back the feed it was given, so a caller can sort the answer', () => {
		expect(filterAlerts(rows, 'all')).not.toBe(rows);
	});

	it('keeps an unrecognised row out of needs-you but in unread while it is unread', () => {
		const unknown = aRow({ id: 'u', type: null, rawType: 'mystery_type' });
		expect(filterAlerts([unknown], 'needs_you')).toEqual([]);
		expect(filterAlerts([unknown], 'unread')).toEqual([unknown]);
	});
});

describe('groupAlerts', () => {
	// notificationTypes.test.ts:174 "splits the feed into needs-you and just news"
	it('splits the feed into needs-you and news, each in feed order', () => {
		const { needsYou, news } = groupAlerts([
			aRow({ id: 'n1' }),
			aNeedsYouRow({ id: 'n2' }),
			aRow({ id: 'n3', type: 'added_to_family', rawType: 'added_to_family' }),
			aNeedsYouRow({ id: 'n4', type: 'assignment_declined', rawType: 'assignment_declined' })
		]);
		expect(needsYou.map((row) => row.id)).toEqual(['n2', 'n4']);
		expect(news.map((row) => row.id)).toEqual(['n1', 'n3']);
	});

	// notificationTypes.test.ts:195 "leaves a group empty rather than inventing rows"
	it('leaves a group empty rather than inventing rows', () => {
		const { needsYou, news } = groupAlerts([aRow({ id: 'n1' })]);
		expect(needsYou).toEqual([]);
		expect(news).toHaveLength(1);
	});

	it('puts an unrecognised row in news', () => {
		const { needsYou, news } = groupAlerts([
			aRow({ id: 'u', type: null, rawType: 'mystery_type' })
		]);
		expect(needsYou).toEqual([]);
		expect(news.map((row) => row.id)).toEqual(['u']);
	});
});

describe('alertCounts: the filter chips', () => {
	// notificationTypes.test.ts:203 "counts all / needs you / unread across the loaded feed"
	it('counts all, needs you and unread across the loaded feed', () => {
		expect(
			alertCounts([
				aNeedsYouRow({ id: 'a' }),
				aRow({ id: 'b' }),
				aRow({ id: 'c' }),
				aRow({ id: 'd', readAt: READ_AT })
			])
		).toEqual({ all: 4, needsYou: 1, unread: 3 });
	});

	// notificationTypes.test.ts:214 "counts an unknown-type row as news, not as something needing you"
	it('counts an unrecognised row as news, not as something needing you', () => {
		expect(alertCounts([aRow({ type: null, rawType: 'task_completed_v2' })])).toEqual({
			all: 1,
			needsYou: 0,
			unread: 1
		});
	});

	it('is all zeros for an empty feed', () => {
		expect(alertCounts([])).toEqual({ all: 0, needsYou: 0, unread: 0 });
	});

	it('counts a needs-you row once however many chips it matches', () => {
		expect(alertCounts([aNeedsYouRow({ readAt: READ_AT })])).toEqual({
			all: 1,
			needsYou: 1,
			unread: 0
		});
	});
});
