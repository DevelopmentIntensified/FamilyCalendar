/**
 * Bulk-plan presentation tables: how a smart dry-run's plan reads, and when it
 * is worth a second look. Expected values come from the legacy source
 * (`$lib/utils/bulkPlan.ts:31-57`) and the README Invariant, never from this
 * code.
 *
 * Doc: ./README.md#selection-bulk-edit-and-the-modals
 */
import { describe, expect, it } from 'vitest';
import {
	calendarBulkPlanDateIsPast,
	calendarBulkPlanLabel,
	calendarBulkPlanMovesToPast,
	type CalendarBulkPlanOp
} from './calendarPage.bulk.rules';

const TODAY = '2026-03-10';
const CALENDARS = [
	{ id: 'cal-school', name: 'School' },
	{ id: 'cal-home', name: 'Home' }
];
const EVENTS = [
	{ id: 'evt-1', masterId: 'evt-1', title: 'Piano' },
	{ id: 'evt-2', masterId: 'evt-2', title: 'Football' }
];

function label(op: CalendarBulkPlanOp): string {
	return calendarBulkPlanLabel(op, EVENTS, CALENDARS, TODAY);
}

describe('calendarBulkPlanLabel', () => {
	it('names a delete by the event’s title', () => {
		expect(label({ id: 'evt-1', delete: true })).toBe('Delete "Piano"');
	});

	it('spells a move, its past marker and the calendar it lands on', () => {
		expect(
			label({ id: 'evt-2', date: '2026-03-04', startTime: '09:00', calendarId: 'cal-school' })
		).toBe('Football: move to Wed, Mar 4 (past), start 09:00, → School');
	});

	it('adds a rename only when the title actually changes', () => {
		expect(label({ id: 'evt-1', title: 'Piano' })).toBe('Piano');
		expect(label({ id: 'evt-1', title: 'Piano lesson' })).toBe('Piano: rename to "Piano lesson"');
	});

	it('reads a bare plan row as its own name, and an unknown titled one as a rename', () => {
		// Legacy compares the plan title with the LOADED row's title; a row the
		// page does not hold has none, so its planned title reads as a rename.
		expect(label({ id: 'unknown-1', title: 'Swim' })).toBe('Swim: rename to "Swim"');
		expect(label({ id: 'unknown-2' })).toBe('Event');
	});

	it('marks a future date without the past marker', () => {
		expect(label({ id: 'evt-1', date: '2026-03-11' })).toBe('Piano: move to Wed, Mar 11');
	});
});

describe('calendarBulkPlanMovesToPast', () => {
	it('is true only when a dated change lands before today', () => {
		expect(calendarBulkPlanMovesToPast([{ id: 'evt-1', date: '2026-03-09' }], TODAY)).toBe(true);
		expect(calendarBulkPlanMovesToPast([{ id: 'evt-1', date: TODAY }], TODAY)).toBe(false);
		expect(calendarBulkPlanMovesToPast([{ id: 'evt-1', title: 'Piano' }], TODAY)).toBe(false);
		expect(calendarBulkPlanMovesToPast(null, TODAY)).toBe(false);
	});

	it('judges a day, not an instant', () => {
		expect(calendarBulkPlanDateIsPast('2026-03-09', TODAY)).toBe(true);
		expect(calendarBulkPlanDateIsPast(TODAY, TODAY)).toBe(false);
		expect(calendarBulkPlanDateIsPast('2026-03-11', TODAY)).toBe(false);
	});
});
