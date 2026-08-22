import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { nextDueDate, TASK_FREQUENCIES } from './tasks';

describe('nextDueDate (Recurring Task cursor)', () => {
	it('advances a weekly task by its interval', () => {
		const next = nextDueDate('2026-08-03T23:59:00.000+02:00', 'weekly', 1);
		expect(DateTime.fromISO(next).diff(DateTime.fromISO('2026-08-03T23:59:00.000+02:00'), 'days').days).toBe(7);
	});

	it('honors intervals greater than one', () => {
		const base = DateTime.fromISO(nextDueDate('2026-08-03T00:00:00Z', 'monthly', 3));
		expect(base.month).toBe(11);
	});

	it('keeps daily cadence across month boundaries', () => {
		const next = DateTime.fromISO(nextDueDate('2026-08-31T12:00:00Z', 'daily', 1));
		expect(next.month).toBe(9);
		expect(next.day).toBe(1);
	});

	it('clamps end-of-month anchors on monthly cadence', () => {
		const next = DateTime.fromISO(nextDueDate('2026-01-31T12:00:00Z', 'monthly', 1));
		expect(next.month).toBe(2);
		expect(next.day).toBe(28);
	});

	it('falls back to now when no due date exists', () => {
		const before = DateTime.now();
		const next = DateTime.fromISO(nextDueDate(null, 'daily', 1));
		expect(next.toMillis()).toBeGreaterThanOrEqual(before.minus({ minutes: 1 }).toMillis());
	});

	it('treats non-positive intervals as one step', () => {
		const a = DateTime.fromISO(nextDueDate('2026-08-03T00:00:00Z', 'weekly', 0));
		const b = DateTime.fromISO(nextDueDate('2026-08-03T00:00:00Z', 'weekly', 1));
		expect(a.toISODate()).toBe(b.toISODate());
	});

	it('exposes the supported frequency set', () => {
		expect(TASK_FREQUENCIES).toEqual(['daily', 'weekly', 'monthly', 'yearly']);
	});
});
