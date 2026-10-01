import { describe, it, expect } from 'vitest';
import { groupEventsByMonth, ARCHIVE_CARD_PADDING } from './archiveMonths';

function ev(title: string, start: string) {
	return { id: title, title, start: new Date(start), location: null };
}

/** The same shape, for the one case the parser cannot make sense of. */
function brokenEv(title: string) {
	return { id: title, title, start: new Date('not-a-date'), location: null };
}

describe('groupEventsByMonth', () => {
	it('puts every event under the month it happened in', () => {
		const months = groupEventsByMonth([
			ev('Thanksgiving', '2025-11-28T18:00:00.000Z'),
			ev('Christmas party', '2025-12-06T18:00:00.000Z'),
			ev('Boxing Day', '2025-12-26T18:00:00.000Z')
		]);
		expect(months.map((m) => m.key)).toEqual(['2025-12', '2025-11']);
		expect(months.map((m) => m.label)).toEqual(['December 2025', 'November 2025']);
		expect(months[0].events).toHaveLength(2);
		expect(months[1].events).toHaveLength(1);
	});

	it('reads newest month first, and newest event first inside it', () => {
		const months = groupEventsByMonth([
			ev('Older', '2025-11-04T18:00:00.000Z'),
			ev('Newest', '2025-12-20T18:00:00.000Z'),
			ev('Middle', '2025-12-02T18:00:00.000Z')
		]);
		expect(months.map((m) => m.events.map((e) => e.title))).toEqual([
			['Newest', 'Middle'],
			['Older']
		]);
	});

	it('groups across a year boundary without merging the two years', () => {
		const months = groupEventsByMonth([
			ev('Last year', '2024-12-31T23:00:00.000Z'),
			ev('This year', '2025-01-01T23:00:00.000Z')
		]);
		expect(months.map((m) => m.label)).toEqual(['January 2025', 'December 2024']);
	});

	it('returns nothing for an empty archive rather than an empty month card', () => {
		expect(groupEventsByMonth([])).toEqual([]);
	});

	it('buckets an unparseable date rather than dropping the row', () => {
		// A bad timestamp showing up as "Date unknown" is a bug report; a bad
		// timestamp silently vanishing is a family wondering where a memory went.
		const months = groupEventsByMonth([brokenEv('Mystery')]);
		expect(months).toHaveLength(1);
		expect(months[0].label).toBe('Date unknown');
	});
});

describe('ARCHIVE_CARD_PADDING', () => {
	// 094: the month header card carried less padding than the cards beside it,
	// and the note was cut off at "padding...". The fix is one token used by
	// BOTH cards, so they cannot drift apart again - and the e2e test measures
	// the rendered padding to prove the token reached the screen.
	it('is a single padding token, not a per-card value', () => {
		expect(ARCHIVE_CARD_PADDING).toMatch(/^p-/);
	});
});
