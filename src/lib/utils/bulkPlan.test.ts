import { describe, it, expect } from 'vitest';
import { describePlanOp, isPastDate, planMovesToPast, type PlanOp } from './bulkPlan';

const events = [{ id: 'e1', title: 'Dinner' }];
const calendars = [{ id: 'c1', name: 'Family' }];

describe('isPastDate', () => {
	it('flags yesterday, clears tomorrow', () => {
		expect(isPastDate('2001-01-01')).toBe(true);
		expect(isPastDate('2099-01-01')).toBe(false);
	});
});

describe('describePlanOp', () => {
	it('describes deletes, renames, moves, and calendar hops', () => {
		expect(describePlanOp({ id: 'e1', delete: true }, events, calendars)).toBe('Delete "Dinner"');
		expect(describePlanOp({ id: 'e1', title: 'Supper' }, events, calendars)).toBe(
			'Dinner: rename to "Supper"'
		);
		expect(
			describePlanOp({ id: 'e1', date: '2099-05-01', calendarId: 'c1' }, events, calendars)
		).toContain('→ Family');
	});

	it('falls back to the op title for unknown events', () => {
		expect(describePlanOp({ id: 'nope' }, events, calendars)).toBe('Event');
		expect(describePlanOp({ id: 'nope', delete: true }, events, calendars)).toBe('Delete "Event"');
	});
});

describe('planMovesToPast', () => {
	it('detects past-dated ops', () => {
		// SAFETY: fixtures mirror the BulkPlanOp shape.
		const past = { ops: [{ id: 'e1', date: '2001-01-01' }] as PlanOp[] };
		// SAFETY: fixtures mirror the BulkPlanOp shape.
		const future = { ops: [{ id: 'e1', date: '2099-01-01' }] as PlanOp[] };
		expect(planMovesToPast(past)).toBe(true);
		expect(planMovesToPast(future)).toBe(false);
		expect(planMovesToPast(null)).toBe(false);
	});
});
