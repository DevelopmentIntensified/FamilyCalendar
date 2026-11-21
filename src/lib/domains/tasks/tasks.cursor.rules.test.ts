/**
 * The Recurring Task cursor rules as tables. Every expected value is carried
 * over from the legacy cursor tests, line for line (file:line in each title):
 * `src/lib/server/db/actions/tasks/tasks.test.ts:155-292` (advance, end of
 * month, zoned day boundaries) and `undoRecurringCompletion.test.ts:220-260`
 * (the rewind). The legacy calls passed "now" as an ISO string whose offset
 * WAS the user's zone; here the same instant is a `Date` plus the zone.
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
	derivePreviousDue,
	needsOverduePin,
	nextCursorDue,
	pinnedDueFor
} from './tasks.cursor.rules';

/** Legacy `tasks.test.ts:149` — Saturday evening UTC. */
const NOW = new Date('2026-08-22T18:00:00.000Z');

/** The zone offset that encoded the legacy test's "now". */
function zoned(isoLocal: string, zone: string): Date {
	return new Date(DateTime.fromISO(isoLocal, { zone }).toISO() ?? '');
}

/** The local wall time of a cursor result in `zone`. */
function wall(iso: string, zone: string): string {
	return DateTime.fromISO(iso, { setZone: true }).setZone(zone).toFormat('yyyy-MM-dd HH:mm');
}

describe('nextCursorDue — the v3 worked examples (tasks.test.ts:155-222)', () => {
	it('early check advances from today by one interval when it lands past the due date', () => {
		const next = nextCursorDue(
			'2026-08-21T23:59:00Z',
			'weekly',
			1,
			new Date('2026-08-19T12:00:00Z'),
			'UTC'
		);
		expect(next === null ? null : DateTime.fromISO(next).toISODate()).toBe('2026-08-26');
	});

	it('due exactly one interval out takes two intervals', () => {
		const next = nextCursorDue(
			'2026-08-28T12:00:00Z',
			'weekly',
			1,
			new Date('2026-08-21T12:00:00Z'),
			'UTC'
		);
		expect(next === null ? null : DateTime.fromISO(next).toISODate()).toBe('2026-09-04');
	});

	it('due partway into the second interval skips past it', () => {
		const next = nextCursorDue(
			'2026-08-25T12:00:00Z',
			'daily',
			2,
			new Date('2026-08-22T12:00:00Z'),
			'UTC'
		);
		expect(next === null ? null : DateTime.fromISO(next).toISODate()).toBe('2026-08-26');
	});

	it('late/pinned completion slides from today', () => {
		const next = nextCursorDue('2026-08-22T23:59:00Z', 'weekly', 1, NOW, 'UTC');
		expect(next === null ? null : DateTime.fromISO(next).toISODate()).toBe('2026-08-29');
	});

	it('honors multi-step intervals', () => {
		const next = nextCursorDue('2026-08-03T12:00:00Z', 'monthly', 3, NOW, 'UTC');
		expect(next === null ? null : DateTime.fromISO(next).month).toBe(11);
	});

	it('anchors at the completion day, not the due day (monthly)', () => {
		const next = nextCursorDue(
			'2026-01-31T12:00:00Z',
			'monthly',
			1,
			new Date('2026-01-15T12:00:00Z'),
			'UTC'
		);
		const dt = next === null ? null : DateTime.fromISO(next);
		expect(dt?.month).toBe(2);
		expect(dt?.day).toBe(15);
	});

	it('null due anchors at today + interval', () => {
		const next = nextCursorDue(null, 'daily', 1, NOW, 'UTC');
		expect(next === null ? null : DateTime.fromISO(next).toISODate()).toBe('2026-08-23');
	});

	it('treats non-positive intervals as one step', () => {
		const zero = nextCursorDue('2026-09-01T00:00:00Z', 'weekly', 0, NOW, 'UTC');
		const one = nextCursorDue('2026-09-01T00:00:00Z', 'weekly', 1, NOW, 'UTC');
		expect(zero).toBe(one);
	});

	it('accepts a JS Date as the due (postgres.js driver shape)', () => {
		const asString = nextCursorDue('2026-08-21T23:59:00Z', 'weekly', 1, NOW, 'UTC');
		const asDate = nextCursorDue(new Date('2026-08-21T23:59:00Z'), 'weekly', 1, NOW, 'UTC');
		expect(asDate).toBe(asString);
	});

	it('leaves the cursor alone for an unknown frequency', () => {
		expect(nextCursorDue('2026-08-21T23:59:00Z', 'hourly', 1, NOW, 'UTC')).toBeNull();
	});
});

describe('nextCursorDue — end-of-month stepping (tasks.test.ts:234-292)', () => {
	const cases: [string, string, string, string, number, string][] = [
		['monthly from Jan-31 lands Feb-28 in a non-leap year', '2026-01-31T12:00:00Z', '2026-01-15T12:00:00Z', 'monthly', 1, '2026-02-28'],
		['monthly from Jan-31 lands Feb-29 in a leap year', '2024-01-31T12:00:00Z', '2024-01-15T12:00:00Z', 'monthly', 1, '2024-02-29'],
		['monthly from Jan-30 lands Feb-28', '2026-01-30T12:00:00Z', '2026-01-15T12:00:00Z', 'monthly', 1, '2026-02-28'],
		['monthly every 3 months from Jan-31 lands Apr-30', '2026-01-31T12:00:00Z', '2026-01-15T12:00:00Z', 'monthly', 3, '2026-04-30'],
		['yearly from Feb-29 lands Feb-28 in a non-leap year', '2024-02-29T12:00:00Z', '2024-02-28T12:00:00Z', 'yearly', 1, '2025-02-28'],
		['yearly from Feb-29 lands Feb-29 in the next leap year', '2024-02-29T12:00:00Z', '2024-02-28T12:00:00Z', 'yearly', 4, '2028-02-29']
	];
	it.each(cases)('%s', (_label, nowIso, dueIso, frequency, interval, expected) => {
		const next = nextCursorDue(dueIso, frequency, interval, new Date(nowIso), 'UTC');
		expect(next === null ? null : DateTime.fromISO(next).toISODate()).toBe(expected);
	});
});

describe('nextCursorDue — day boundaries follow the zone (tasks.test.ts:314-330)', () => {
	const cases: [string, string, string, string | null, string, number, string][] = [
		['LA evening daily lands local tomorrow midnight', 'America/Los_Angeles', '2026-11-01T20:00', null, 'daily', 1, '2026-11-02 00:00'],
		['Chicago morning daily lands Nov 2 local', 'America/Chicago', '2026-11-01T10:00', '2026-11-01T09:00', 'daily', 1, '2026-11-02 00:00'],
		['Tokyo early morning daily stays on the Tokyo day', 'Asia/Tokyo', '2026-11-02T08:00', '2026-11-01T23:59', 'daily', 1, '2026-11-03 00:00'],
		['Auckland weekly anchors on the Auckland day', 'Pacific/Auckland', '2026-11-02T07:00', null, 'weekly', 1, '2026-11-09 00:00'],
		['LA late-night every-2-days', 'America/Los_Angeles', '2026-11-01T23:30', null, 'daily', 2, '2026-11-03 00:00']
	];
	it.each(cases)('%s', (_label, zone, nowLocal, dueLocal, frequency, interval, expected) => {
		const due = dueLocal ? DateTime.fromISO(dueLocal, { zone }).toISO() : null;
		const next = nextCursorDue(due, frequency, interval, zoned(nowLocal, zone), zone);
		expect(next === null ? null : wall(next, zone)).toBe(expected);
	});
});

describe('needsOverduePin (tasks.test.ts:294-310, 333-346)', () => {
	const cases: [string, string, string, string, boolean][] = [
		['pins a strictly-before-today due', 'UTC', '2026-08-22T18:00', '2026-08-21T23:59:00Z', true],
		['does not pin today-end', 'UTC', '2026-08-22T18:00', '2026-08-22T23:59:00Z', false],
		['does not pin a future due', 'UTC', '2026-08-22T18:00', '2026-08-23T09:00:00Z', false],
		['never pins a dateless row', 'UTC', '2026-08-22T18:00', '', false],
		[
			'pins a due that was yesterday in Tokyo (still "today" in UTC)',
			'Asia/Tokyo',
			'2026-11-02T08:00',
			'2026-11-01T23:59:00+09:00',
			true
		],
		[
			'does not pin a today-end pin in Chicago after 6pm',
			'America/Chicago',
			'2026-11-01T19:00',
			'2026-11-01T23:59:00-05:00',
			false
		],
		[
			'does not pin a due later today in Auckland',
			'Pacific/Auckland',
			'2026-11-02T07:00',
			'2026-11-02T00:30:00+13:00',
			false
		]
	];
	it.each(cases)('%s', (_label, zone, nowLocal, due, expected) => {
		expect(needsOverduePin(due === '' ? null : due, zoned(nowLocal, zone), zone)).toBe(expected);
	});
});

describe('pinnedDueFor', () => {
	it('pins to 23:59 local in the zone', () => {
		expect(wall(pinnedDueFor(NOW, 'UTC'), 'UTC')).toBe('2026-08-22 23:59');
	});

	it('pins to the local 23:59, not the UTC one', () => {
		const zone = 'Asia/Tokyo';
		expect(wall(pinnedDueFor(zoned('2026-11-02T08:00', zone), zone), zone)).toBe(
			'2026-11-02 23:59'
		);
	});
});

describe('derivePreviousDue — the undo rewind (undoRecurringCompletion.test.ts:220-260)', () => {
	const now = new Date('2026-09-02T12:00:00.000Z');

	it('derives the previous cursor from the completion anchor', () => {
		const previous = derivePreviousDue(
			'2026-09-02T00:00:00.000Z',
			'daily',
			1,
			'2026-09-01T15:00:00.000Z',
			now
		);
		expect(previous === null ? null : Date.parse(previous)).toBe(
			Date.parse('2026-09-01T00:00:00.000Z')
		);
	});

	it('rewinds a multi-step cursor by whole intervals', () => {
		const previous = derivePreviousDue(
			'2026-09-08T00:00:00.000Z',
			'weekly',
			1,
			'2026-09-01T15:00:00.000Z',
			now
		);
		expect(previous === null ? null : Date.parse(previous)).toBe(
			Date.parse('2026-09-01T00:00:00.000Z')
		);
	});

	it('falls back to a plain one-interval rewind when no candidate reproduces the due', () => {
		const previous = derivePreviousDue(
			'2026-09-02T12:00:00.000Z',
			'daily',
			1,
			null,
			now
		);
		expect(previous === null ? null : DateTime.fromISO(previous).toISODate()).toBe('2026-09-01');
	});

	it('answers null for a missing due or an unknown frequency', () => {
		expect(derivePreviousDue(null, 'daily', 1, null, now)).toBeNull();
		expect(derivePreviousDue('2026-09-02T00:00:00.000Z', 'hourly', 1, null, now)).toBeNull();
	});
});
