import { describe, it, expect } from 'vitest';
import {
	ARCHIVE_CARD_PADDING,
	taskArchiveDayLabel,
	taskArchiveMonths,
	taskRetentionScale,
	type TaskArchiveEventLike
} from './tasks.archive.rules';

/**
 * The archive page's two model pieces, carried over from the legacy
 * `archiveMonths.test.ts` with the same values: the month grouping and the
 * retention scale (094).
 */

function archiveEvent(title: string, start: string): TaskArchiveEventLike {
	return { title, start: new Date(start), location: null };
}

describe('taskArchiveMonths', () => {
	it('puts every event under the month it happened in', () => {
		const months = taskArchiveMonths([
			archiveEvent('Thanksgiving', '2025-11-28T18:00:00.000Z'),
			archiveEvent('Christmas party', '2025-12-06T18:00:00.000Z'),
			archiveEvent('Boxing Day', '2025-12-26T18:00:00.000Z')
		]);
		expect(months.map((month) => month.key)).toEqual(['2025-12', '2025-11']);
		expect(months.map((month) => month.label)).toEqual(['December 2025', 'November 2025']);
		expect(months[0]?.events).toHaveLength(2);
		expect(months[1]?.events).toHaveLength(1);
	});

	it('reads newest month first, and newest event first inside it', () => {
		const months = taskArchiveMonths([
			archiveEvent('Older', '2025-11-04T18:00:00.000Z'),
			archiveEvent('Newest', '2025-12-20T18:00:00.000Z'),
			archiveEvent('Middle', '2025-12-02T18:00:00.000Z')
		]);
		expect(months.map((month) => month.events.map((event) => event.title))).toEqual([
			['Newest', 'Middle'],
			['Older']
		]);
	});

	it('groups across a year boundary without merging the two years', () => {
		const months = taskArchiveMonths([
			archiveEvent('Last year', '2024-12-31T23:00:00.000Z'),
			archiveEvent('This year', '2025-01-01T23:00:00.000Z')
		]);
		expect(months.map((month) => month.label)).toEqual(['January 2025', 'December 2024']);
	});

	it('returns nothing for an empty archive rather than an empty month card', () => {
		expect(taskArchiveMonths([])).toEqual([]);
	});

	it('buckets an unparseable date rather than dropping the row', () => {
		// A bad timestamp showing up as "Date unknown" is a bug report; a bad
		// timestamp silently vanishing is a family wondering where a memory went.
		const months = taskArchiveMonths([
			{ title: 'Mystery', start: new Date('not-a-date'), location: null }
		]);
		expect(months).toHaveLength(1);
		expect(months[0]?.label).toBe('Date unknown');
	});
});

describe('taskArchiveDayLabel', () => {
	it('prints the day, the short month and the year', () => {
		expect(taskArchiveDayLabel(new Date('2025-12-06T18:00:00.000Z'))).toBe('6 Dec 2025');
	});
});

describe('ARCHIVE_CARD_PADDING', () => {
	// 094: the month header card carried less padding than the cards beside it.
	// The fix is one token used by BOTH cards, so they cannot drift apart again —
	// and the e2e test measures the rendered padding to prove the token reached
	// the screen.
	it('is a single padding token, not a per-card value', () => {
		expect(ARCHIVE_CARD_PADDING).toMatch(/^p-/);
	});
});

describe('taskRetentionScale', () => {
	it('splits the total window into viewable, kept and gone', () => {
		const scale = taskRetentionScale({ viewDays: 365, archivedDays: 730 });
		expect(scale.total).toBe(730);
		expect(scale.viewable).toBe(365);
		expect(scale.kept).toBe(365);
		expect(scale.deletedAfter).toBe(730);
	});

	it('fills the track in the proportion the windows really are', () => {
		expect(taskRetentionScale({ viewDays: 365, archivedDays: 730 }).viewablePct).toBe(50);
		expect(taskRetentionScale({ viewDays: 90, archivedDays: 365 }).viewablePct).toBe(25);
	});

	it('draws no track at all for a plan that keeps nothing', () => {
		// archivedDays <= 0 means the archive keeps nothing, so there is no
		// "deleted after" date to draw and no band to fill. Zeros, not a negative
		// kept window and not a division by zero.
		expect(taskRetentionScale({ viewDays: 30, archivedDays: 0 })).toEqual({
			total: 0,
			viewable: 0,
			kept: 0,
			deletedAfter: 0,
			viewablePct: 0
		});
	});

	it('does not divide by zero on a plan with no windows at all', () => {
		expect(taskRetentionScale({ viewDays: 0, archivedDays: 0 }).viewablePct).toBe(0);
	});

	it('caps the viewable band when a plan keeps less than it shows', () => {
		// retentionViewDays > archivedRetentionDays is contradictory config; the
		// track must still fill exactly once.
		const scale = taskRetentionScale({ viewDays: 730, archivedDays: 365 });
		expect(scale.viewable).toBe(365);
		expect(scale.kept).toBe(0);
		expect(scale.viewablePct).toBe(100);
	});
});
