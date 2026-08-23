import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { advanceCursor, needsOverduePin, TASK_FREQUENCIES } from './tasks';

const NOW = '2026-08-22T18:00:00.000Z'; // Saturday evening UTC

function iso(s: string): string {
	return DateTime.fromISO(s).toISO()!;
}

describe('advanceCursor (Recurring Task cursor v2)', () => {
	it('early check keeps the scheduled slot: due Fri, checked Wed -> next Fri', () => {
		const wed = iso('2026-08-19T12:00:00Z'); // Wednesday
		const friDue = iso('2026-08-21T23:59:00Z');
		const next = DateTime.fromISO(advanceCursor(friDue, 'weekly', 1, wed));
		expect(next.toISODate()).toBe(iso('2026-08-28T23:59:00Z').slice(0, 10));
	});

	it('late/pinned completion slides from today', () => {
		const overduePinned = iso('2026-08-22T23:59:00Z');
		const next = DateTime.fromISO(advanceCursor(overduePinned, 'weekly', 1, NOW));
		expect(next.toISODate()).toBe(iso('2026-08-29T23:59:00Z').slice(0, 10));
	});

	it('honors multi-step intervals', () => {
		const next = DateTime.fromISO(advanceCursor(iso('2026-08-03T12:00:00Z'), 'monthly', 3, NOW));
		expect(next.month).toBe(11);
	});

	it('clamps end-of-month anchors on monthly cadence (early check)', () => {
		const next = DateTime.fromISO(
			advanceCursor(iso('2026-01-31T12:00:00Z'), 'monthly', 1, '2026-01-15T12:00:00Z')
		);
		expect(next.month).toBe(2);
		expect(next.day).toBe(28);
	});

	it('null due anchors at today + interval', () => {
		const next = DateTime.fromISO(advanceCursor(null, 'daily', 1, NOW));
		expect(next.toISODate()).toBe(DateTime.fromISO(NOW).plus({ days: 1 }).toISODate());
	});

	it('treats non-positive intervals as one step', () => {
		const a = DateTime.fromISO(advanceCursor(iso('2026-09-01T00:00:00Z'), 'weekly', 0, NOW));
		const b = DateTime.fromISO(advanceCursor(iso('2026-09-01T00:00:00Z'), 'weekly', 1, NOW));
		expect(a.toISODate()).toBe(b.toISODate());
	});

	it('exposes the supported frequency set', () => {
		expect(TASK_FREQUENCIES).toEqual(['daily', 'weekly', 'monthly', 'yearly']);
	});
});

describe('needsOverduePin (sticky overdue)', () => {
	it('pins strictly-before-today dues', () => {
		expect(needsOverduePin(iso('2026-08-21T23:59:00Z'), NOW)).toBe(true);
	});

	it('does not pin today-end or future dues', () => {
		expect(needsOverduePin(iso('2026-08-22T23:59:00Z'), NOW)).toBe(false);
		expect(needsOverduePin(iso('2026-09-01T00:00:00Z'), NOW)).toBe(false);
	});

	it('never pins dateless rows', () => {
		expect(needsOverduePin(null, NOW)).toBe(false);
	});
});
