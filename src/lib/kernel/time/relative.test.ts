/**
 * The relative day label, which the app chrome asks for on every page: the
 * calendar-day rule in the zone, its two bucket edges, and the parse rule the
 * string forms share with `dates.ts`. Moved here from `dates.test.ts` when the
 * rule left luxon behind (ADR 0010).
 *
 * Doc: src/lib/kernel/README.md#time
 */
import { describe, expect, it } from 'vitest';
import { relativeFromNow } from './relative';

const NOW = '2026-11-11T12:00:00.000Z';

describe('relative dates', () => {
	const NEW_YORK = 'America/New_York';

	it.each([
		['2026-11-11T15:00:00Z', 'today'],
		['2026-11-12T15:00:00Z', 'in 1 day'],
		['2026-11-14T15:00:00Z', 'in 3 days'],
		// Bucket edges: 13 calendar days still reads days, 14 switches to weeks.
		['2026-11-24T15:00:00Z', 'in 13 days'],
		['2026-11-25T15:00:00Z', 'in 2 weeks'],
		// 59 calendar days still reads weeks, 60 switches to months.
		['2027-01-09T15:00:00Z', 'in 8 weeks'],
		['2027-01-10T15:00:00Z', 'in 2 months'],
		['2026-11-10T15:00:00Z', '1 day ago'],
		['2026-11-01T15:00:00Z', '10 days ago'],
		['2026-10-14T15:00:00Z', '4 weeks ago'],
		['2026-09-01T15:00:00Z', '2 months ago'],
		['2027-01-11T15:00:00Z', 'in 2 months'],
		['nope', '']
	])('relativeFromNow(%j) → %j', (instant, expected) => {
		expect(relativeFromNow(instant, NOW, NEW_YORK)).toBe(expected);
	});

	it('counts calendar days in the zone, not in UTC', () => {
		// In Kiritimati 02:00Z is 16:00 on the 11th; 12:00Z is 02:00 on the 12th.
		const zone = 'Pacific/Kiritimati';
		expect(relativeFromNow('2026-11-11T12:00:00Z', '2026-11-11T02:00:00Z', zone)).toBe('in 1 day');
		expect(relativeFromNow('2026-11-11T12:00:00Z', '2026-11-11T02:00:00Z', 'UTC')).toBe('today');
	});

	it('reads the same forms dates.ts reads, and nothing else', () => {
		const zone = 'UTC';
		// A `Date` is an instant; a date-only string is that calendar day.
		expect(relativeFromNow(new Date('2026-11-14T00:00:00Z'), NOW, zone)).toBe('in 3 days');
		expect(relativeFromNow(new Date(Number.NaN), NOW, zone)).toBe('');
		expect(relativeFromNow('2026-11-14', NOW, zone)).toBe('in 3 days');
		// No offset means UTC, so this is the 13th in New York's evening.
		expect(relativeFromNow('2026-11-14T02:00:00', '2026-11-11T12:00:00.000Z', zone)).toBe(
			'in 3 days'
		);
		// With an offset the instant keeps it.
		expect(relativeFromNow('2026-11-14T02:00:00-05:00', NOW, zone)).toBe('in 3 days');
		// A day that does not exist, a non-date shape and an unknown zone all read ''.
		expect(relativeFromNow('2026-02-30T10:00:00Z', NOW, zone)).toBe('');
		expect(relativeFromNow('November 14, 2026', NOW, zone)).toBe('');
		expect(relativeFromNow('2026-11-14T10:00:00Z', NOW, 'Not/AZone')).toBe('');
	});
});
