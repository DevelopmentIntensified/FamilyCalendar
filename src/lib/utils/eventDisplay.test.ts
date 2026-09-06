import { describe, it, expect } from 'vitest';
import { parseEvents } from './eventDisplay';

describe('parseEvents', () => {
	it('passes single-day events through untouched', () => {
		const events = [
			{ id: 1, title: 'One', start: '2026-03-01T10:00:00Z', end: '2026-03-01T12:00:00Z' }
		];
		const result = parseEvents(events, 'UTC');
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(1);
		expect(result[0].title).toBe('One');
		expect(result[0].date.toISOString()).toBe('2026-03-01T10:00:00.000Z');
		expect(result[0].end?.toISOString()).toBe('2026-03-01T12:00:00.000Z');
	});

	it('handles events without an end date as single-day', () => {
		const events = [{ id: 2, title: 'Open', start: '2026-03-01T10:00:00Z' }];
		const result = parseEvents(events, 'UTC');
		expect(result).toHaveLength(1);
		expect(result[0].end).toBeNull();
	});

	it('splits a cross-month event (Mar 1 → Apr 1) instead of collapsing it by day-of-month', () => {
		const events = [
			{ id: 3, title: 'Trip', start: '2026-03-01T09:00:00Z', end: '2026-04-01T09:00:00Z' }
		];
		const result = parseEvents(events, 'UTC');
		expect(result).toHaveLength(32); // Mar 1 through Apr 1 inclusive
	});

	it('splits a cross-month event (Mar 1 → Apr 2) into one entry per day', () => {
		const events = [
			{ id: 4, title: 'Fair', start: '2026-03-01T09:00:00Z', end: '2026-04-02T17:00:00Z' }
		];
		const result = parseEvents(events, 'UTC');
		expect(result).toHaveLength(33); // Mar 1 through Apr 2 inclusive
		expect(result[0].date.toISOString()).toBe('2026-03-01T09:00:00.000Z');
		expect(result[32].date.toISOString()).toBe('2026-04-02T09:00:00.000Z');
		// Every chunk keeps the original fields and shares the same end.
		for (const chunk of result) {
			expect(chunk.id).toBe(4);
			expect(chunk.title).toBe('Fair');
			expect(chunk.end?.toISOString()).toBe('2026-04-02T17:00:00.000Z');
		}
	});

	it('splits a DST-spanning multi-day event at local midnights, not drifted hours', () => {
		// US DST begins 2026-03-08 at 2 AM ET. Local midnight Mar 7/8 is UTC-5,
		// local midnight Mar 9 is UTC-4 — the last gap is 23 hours, not 24.
		const events = [
			{
				id: 5,
				title: 'Retreat',
				start: '2026-03-07T05:00:00.000Z', // 00:00 America/New_York (EST)
				end: '2026-03-09T04:00:00.000Z' // 00:00 America/New_York (EDT)
			}
		];
		const result = parseEvents(events, 'America/New_York');
		expect(result).toHaveLength(3);
		expect(result[0].date.toISOString()).toBe('2026-03-07T05:00:00.000Z'); // Mar 7 midnight EST
		expect(result[1].date.toISOString()).toBe('2026-03-08T05:00:00.000Z'); // Mar 8 midnight EST
		expect(result[2].date.toISOString()).toBe('2026-03-09T04:00:00.000Z'); // Mar 9 midnight EDT
	});

	it('splits in the VIEWER zone: a Sep 5–6 event for a UTC+12 user is exactly 2 days', () => {
		// NZST is UTC+12 in September. Sep 5 08:00Z → Sep 6 10:00Z is
		// Sep 5 20:00 → Sep 6 22:00 Auckland — the viewer's Sep 5–6, exactly
		// two day entries anchored on their local dates.
		const events = [
			{
				id: 6,
				title: 'Weekend',
				start: '2026-09-05T08:00:00Z',
				end: '2026-09-06T10:00:00Z'
			}
		];
		const inAuckland = parseEvents(events, 'Pacific/Auckland');
		expect(inAuckland).toHaveLength(2);
		expect(inAuckland[0].date.toISOString()).toBe('2026-09-05T08:00:00.000Z'); // Sep 5 local
		expect(inAuckland[1].date.toISOString()).toBe('2026-09-06T08:00:00.000Z'); // Sep 6 local
	});

	it('collapses on LOCAL day: no phantom trailing day for UTC+ viewers', () => {
		// Sep 5 12:00Z → Sep 6 00:30Z is Sep 6 00:00 → 12:30 NZST — ONE local
		// day. Splitting in server UTC spans two UTC days and emits a second
		// entry that the UTC+12 viewer buckets on a phantom Sep 7.
		const events = [
			{
				id: 7,
				title: 'Lunch',
				start: '2026-09-05T12:00:00Z',
				end: '2026-09-06T00:30:00Z'
			}
		];
		expect(parseEvents(events, 'UTC')).toHaveLength(2); // server zone: phantom day
		const inAuckland = parseEvents(events, 'Pacific/Auckland');
		expect(inAuckland).toHaveLength(1);
		expect(inAuckland[0].date.toISOString()).toBe('2026-09-05T12:00:00.000Z'); // Sep 6 local
	});
});
