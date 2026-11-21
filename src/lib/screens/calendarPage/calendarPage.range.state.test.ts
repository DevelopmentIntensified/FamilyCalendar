/**
 * The fetched-month cache in node, no DOM: the matrix window it asks for, the
 * twelve-month bound and its eviction, wholesale replacement, the generation
 * guard, attempted-on-failure and the busy month. Expected values come from the
 * README Invariants and legacy `Calendar.svelte:183-303`.
 *
 * Doc: ./README.md#the-bounded-month-window-and-the-fetched-month-cache
 */
import { describe, expect, it, vi } from 'vitest';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import type { CalendarPageEventRow } from './calendarPage.contract';
import { CalendarRangeCache, type CalendarRangeSource } from './calendarPage.range.state.svelte';

function row(title: string, date = '2026-03-10'): CalendarPageEventRow {
	return {
		id: title,
		masterId: null,
		occurrenceDate: null,
		title,
		description: null,
		location: null,
		date,
		start: `${date}T10:00:00.000Z`,
		end: null,
		allDay: false,
		calendarId: 'personal',
		ownerId: 'me',
		creatorName: null,
		rsvpStatus: null,
		attendance: null,
		recurrenceFrequency: null
	};
}

function cache(serverLoadedMonths: string[] = ['2026-03']) {
	return new CalendarRangeCache({
		weekStart: 'sunday',
		zone: 'UTC',
		serverLoadedMonths,
		toasts: memoryToasts()
	});
}

describe('calendarRangeCache', () => {
	it('asks for the grid window of the month it shows, and never the SSR month', async () => {
		const ranges = cache(['2026-03']);
		const load = vi.fn<CalendarRangeSource>(async () => [row('April', '2026-04-10')]);

		await ranges.request('2026-03', load);
		expect(load).not.toHaveBeenCalled();

		await ranges.request('2026-04', load);
		expect(load).toHaveBeenCalledWith('2026-03-29', '2026-05-02');
		expect(ranges.rows().map((entry) => entry.title)).toEqual(['April']);
	});

	it('drops the padded rows the ranged read returns', async () => {
		const ranges = cache([]);
		const load: CalendarRangeSource = async () => [
			row('Inside', '2026-03-10'),
			row('Padded', '2026-04-20')
		];

		await ranges.request('2026-03', load);
		expect(ranges.rows().map((entry) => entry.title)).toEqual(['Inside']);
	});

	it('evicts the oldest month once twelve are held, and refetches it', async () => {
		const ranges = cache([]);
		const load = vi.fn<CalendarRangeSource>(async (_from, to) => [row(`to ${to}`, to)]);
		const months = [
			...Array.from({ length: 12 }, (_, index) => `2026-${String(index + 1).padStart(2, '0')}`),
			'2027-01'
		];

		for (const month of months) await ranges.request(month, load);
		expect(ranges.held.length).toBe(12);
		expect(ranges.held).not.toContain('2026-01');
		expect(load).toHaveBeenCalledTimes(13);

		// The evicted month is fetchable again.
		await ranges.request('2026-01', load);
		expect(load).toHaveBeenCalledTimes(14);
		expect(ranges.held).toContain('2026-01');
	});

	it('a refetch replaces the month instead of appending', async () => {
		const ranges = cache([]);
		await ranges.request('2026-04', async () => [row('Old', '2026-04-10')]);
		ranges.invalidate('2026-04');
		await ranges.request('2026-04', async () => [row('New', '2026-04-10')]);

		expect(ranges.rows().map((entry) => entry.title)).toEqual(['New']);
	});

	it('drops a fetch that started before the reload, and keeps the month on screen', async () => {
		const ranges = cache([]);
		const deferred = Promise.withResolvers<readonly CalendarPageEventRow[]>();
		const pending = ranges.request('2026-04', () => deferred.promise);

		ranges.invalidate('2026-04');
		deferred.resolve([row('Stale')]);
		await pending;

		expect(ranges.rows()).toEqual([]);
		expect(ranges.isBusy('2026-04')).toBe(false);
	});

	it('says so in a toast when a month fails to load, and does not retry it', async () => {
		const toasts = memoryToasts();
		const ranges = new CalendarRangeCache({
			weekStart: 'sunday',
			zone: 'UTC',
			serverLoadedMonths: [],
			toasts
		});
		const load = vi.fn<CalendarRangeSource>(async () => {
			throw new Error('boom');
		});

		await ranges.request('2026-04', load);
		await ranges.request('2026-04', load);

		expect(load).toHaveBeenCalledTimes(1);
		expect(toasts.items.map((item) => item.text)).toEqual([
			"Couldn't load that month's events — try again."
		]);
		expect(ranges.held).toContain('2026-04');
	});

	it('reports the month it is fetching', async () => {
		const ranges = cache([]);
		const deferred = Promise.withResolvers<readonly CalendarPageEventRow[]>();
		const pending = ranges.request('2026-04', () => deferred.promise);
		expect(ranges.isBusy('2026-04')).toBe(true);
		deferred.resolve([]);
		await pending;
		expect(ranges.isBusy('2026-04')).toBe(false);
	});
});
