import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { overlapsDay, pickDayEntries } from './dayOverlap';
import { parseEvents } from './eventDisplay';

/** [dayStart, nextDayStart) for a YYYY-MM-DD in a zone. */
function day(iso: string, zone: string) {
	const s = DateTime.fromISO(iso, { zone }).startOf('day');
	return { start: s.toJSDate(), next: s.plus({ days: 1 }).toJSDate() };
}

describe('overlapsDay (#285)', () => {
	const zone = 'America/Chicago';
	const nov3 = day('2026-11-03', zone);

	it('keeps an event that started weeks before and ends weeks after', () => {
		expect(
			overlapsDay('2026-10-15T15:00:00.000Z', '2026-11-10T15:00:00.000Z', nov3.start, nov3.next)
		).toBe(true);
	});

	it('drops an event ending exactly at the viewed day 00:00 (end is exclusive)', () => {
		const end = nov3.start.toISOString();
		expect(overlapsDay('2026-11-02T20:00:00.000Z', end, nov3.start, nov3.next)).toBe(false);
	});

	it('keeps an event ending one ms after the viewed day 00:00', () => {
		const end = new Date(nov3.start.getTime() + 1).toISOString();
		expect(overlapsDay('2026-11-02T20:00:00.000Z', end, nov3.start, nov3.next)).toBe(true);
	});

	it('drops an event starting exactly at the next day 00:00', () => {
		const start = nov3.next.toISOString();
		expect(overlapsDay(start, null, nov3.start, nov3.next)).toBe(false);
	});

	it('keeps a zero-length / end-less event at exactly 00:00 of the viewed day', () => {
		const at = nov3.start.toISOString();
		expect(overlapsDay(at, null, nov3.start, nov3.next)).toBe(true);
		expect(overlapsDay(at, at, nov3.start, nov3.next)).toBe(true);
	});

	it('uses the user zone: 03:30Z Nov 4 is still Nov 3 in Chicago', () => {
		expect(overlapsDay('2026-11-04T03:30:00.000Z', null, nov3.start, nov3.next)).toBe(true);
		const utcNov3 = day('2026-11-03', 'UTC');
		expect(overlapsDay('2026-11-04T03:30:00.000Z', null, utcNov3.start, utcNov3.next)).toBe(false);
	});
});

describe('pickDayEntries over parseEvents output (#285)', () => {
	for (const zone of ['UTC', 'America/Chicago', 'Pacific/Auckland']) {
		it(`one entry per overlapping event, none for an event ending at 00:00 — ${zone}`, () => {
			const nov3 = day('2026-11-03', zone);
			const startOf = (d: string, h = 0) =>
				DateTime.fromISO(d, { zone }).set({ hour: h }).toUTC().toISO()!;
			const events = [
				// Multi-day trip, Oct 15 -> Nov 10.
				{ id: 'trip', start: startOf('2026-10-15', 10), end: startOf('2026-11-10', 9) },
				// Ends exactly at Nov 3 00:00 local: belongs to Nov 2 only.
				{ id: 'ends-midnight', start: startOf('2026-11-02', 18), end: startOf('2026-11-03') },
				// Overnight into the viewed day.
				{ id: 'overnight', start: startOf('2026-11-02', 22), end: startOf('2026-11-03', 2) },
				// All-day multi-day spanning the viewed day (local midnights, inclusive end-of-day).
				{
					id: 'all-day',
					allDay: true,
					start: startOf('2026-11-01'),
					end: DateTime.fromISO('2026-11-04', { zone }).endOf('day').toUTC().toISO()!
				},
				// Plain event on the day.
				{ id: 'on-day', start: startOf('2026-11-03', 12), end: startOf('2026-11-03', 13) },
				// Next day only.
				{ id: 'tomorrow', start: startOf('2026-11-04'), end: startOf('2026-11-04', 1) }
			];
			const picked = pickDayEntries(parseEvents(events, zone), nov3.start, nov3.next);
			expect(picked.map((e) => e.id).sort()).toEqual(
				['all-day', 'on-day', 'overnight', 'trip'].sort()
			);
		});
	}

	it('keeps an event that only reaches the viewed day after its start time-of-day', () => {
		// Starts 20:00 Nov 1, ends 08:00 Nov 3 (Chicago): parseEvents' Nov 3
		// entry carries the 20:00 wall time, after the event already ended —
		// the event still overlaps Nov 3 (00:00-08:00) and must show once.
		const zone = 'America/Chicago';
		const nov3 = day('2026-11-03', zone);
		const ev = {
			id: 'x',
			start: DateTime.fromISO('2026-11-01T20:00', { zone }).toUTC().toISO()!,
			end: DateTime.fromISO('2026-11-03T08:00', { zone }).toUTC().toISO()!
		};
		const picked = pickDayEntries(parseEvents([ev], zone), nov3.start, nov3.next);
		expect(picked.map((e) => e.id)).toEqual(['x']);
	});
});
