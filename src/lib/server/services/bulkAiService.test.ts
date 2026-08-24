import { describe, it, expect } from 'vitest';
import { parseBulkPlan, planBulkEdits, type BulkEventSummary } from './bulkAiService';

const IDS = ['evt-1', 'evt-2', 'evt-3'];

describe('parseBulkPlan', () => {
	it('parses ops wrapped in {ops: []}', () => {
		const content = JSON.stringify({
			ops: [
				{ id: 'evt-1', title: 'Soccer practice', date: '2026-09-04' },
				{ id: 'evt-2', location: 'Community Hall' }
			]
		});
		const ops = parseBulkPlan(content, IDS);
		expect(ops).toHaveLength(2);
		expect(ops[0]).toEqual({ id: 'evt-1', title: 'Soccer practice', date: '2026-09-04' });
		expect(ops[1]).toEqual({ id: 'evt-2', location: 'Community Hall' });
	});

	it('accepts a bare array', () => {
		const content = JSON.stringify([{ id: 'evt-3', startTime: '9:30' }]);
		const ops = parseBulkPlan(content, IDS);
		expect(ops).toHaveLength(1);
		expect(ops[0].startTime).toBe('09:30');
	});

	it('drops ids outside the allowed set (hallucination guard)', () => {
		const content = JSON.stringify({
			ops: [
				{ id: 'evt-1', title: 'Keep' },
				{ id: 'evt-999', title: 'Drop' }
			]
		});
		const ops = parseBulkPlan(content, IDS);
		expect(ops).toHaveLength(1);
		expect(ops[0].id).toBe('evt-1');
	});

	it('rejects malformed field values and empty ops', () => {
		const content = JSON.stringify({
			ops: [
				{ id: 'evt-1', date: 'September 4th' },
				{ id: 'evt-2', startTime: '25:99' },
				{ id: 'evt-3' }
			]
		});
		expect(parseBulkPlan(content, IDS)).toHaveLength(0);
	});

	it('deduplicates repeated ids keeping the first valid op', () => {
		const content = JSON.stringify({
			ops: [
				{ id: 'evt-1', title: 'First' },
				{ id: 'evt-1', title: 'Second' }
			]
		});
		const ops = parseBulkPlan(content, IDS);
		expect(ops).toHaveLength(1);
		expect(ops[0].title).toBe('First');
	});

	it('returns [] on invalid JSON', () => {
		expect(parseBulkPlan('not json at all', IDS)).toEqual([]);
	});

	it('accepts delete ops and calendar moves', () => {
		const content = JSON.stringify({
			ops: [
				{ id: 'evt-1', delete: true, title: 'ignored' },
				{ id: 'evt-2', calendarId: 'cal-9-abcde' }
			]
		});
		const ops = parseBulkPlan(content, [...IDS, 'cal-9-abcde']);
		expect(ops[0]).toEqual({ id: 'evt-1', delete: true });
		expect(ops[1].calendarId).toBe('cal-9-abcde');
	});
});

const TODAY = '2026-08-23'; // a Sunday
const EVENTS: BulkEventSummary[] = [
	{ id: 'evt-1', title: 'Running at 5pm with george', start: '2026-08-21T17:00:00.000-04:00', location: null },
	{ id: 'evt-2', title: 'Soccer practice', start: '2026-08-25T16:00:00.000-04:00', location: null },
	{ id: 'evt-3', title: 'Back to School Hike', start: '2026-08-29T09:00:00.000-04:00', location: null }
];
const CALS = [
	{ id: 'cal-fam-12345', name: 'Family Calendar' },
	{ id: 'cal-pers-67890', name: 'Personal Calendar' }
];

describe('planBulkEdits (local parser)', () => {
	it('moves every selected event to next friday, keeping time', () => {
		const ops = planBulkEdits('move to next friday', EVENTS, TODAY);
		expect(ops).toHaveLength(3);
		expect(ops[0]).toEqual({ id: 'evt-1', date: '2026-08-28' });
	});

	it('parses tomorrow, today and explicit dates', () => {
		expect(planBulkEdits('move to tomorrow', EVENTS, TODAY)[0].date).toBe('2026-08-24');
		expect(planBulkEdits('reschedule to 2026-09-01', EVENTS, TODAY)[0].date).toBe('2026-09-01');
		expect(planBulkEdits('move to aug 28', EVENTS, TODAY)[0].date).toBe('2026-08-28');
	});

	it('parses this weekend as the upcoming saturday', () => {
		const ops = planBulkEdits('move to this weekend', EVENTS, TODAY);
		expect(ops.every((op) => op.date === '2026-08-29')).toBe(true);
	});

	it('sets a time from "at 3pm" and keeps the date', () => {
		const ops = planBulkEdits('move to 3pm', EVENTS, TODAY);
		expect(ops[0].startTime).toBe('15:00');
		expect(ops[0].date).toBeUndefined();
	});

	it('deletes when asked', () => {
		const ops = planBulkEdits('delete these', EVENTS, TODAY);
		expect(ops).toEqual([
			{ id: 'evt-1', delete: true },
			{ id: 'evt-2', delete: true },
			{ id: 'evt-3', delete: true }
		]);
	});

	it('targets only named events', () => {
		const ops = planBulkEdits('move soccer practice to friday', EVENTS, TODAY);
		expect(ops).toEqual([{ id: 'evt-2', date: '2026-08-28' }]);
	});

	it('moves to a calendar by name', () => {
		const ops = planBulkEdits('move to family calendar', EVENTS, TODAY, CALS);
		expect(ops[0].calendarId).toBe('cal-fam-12345');
		expect(ops[0].date).toBeUndefined();
	});

	it('combines date + calendar', () => {
		const ops = planBulkEdits('move to personal calendar next friday', EVENTS, TODAY, CALS);
		expect(ops[0]).toEqual({ id: 'evt-1', date: '2026-08-28', calendarId: 'cal-pers-67890' });
	});

	it('returns [] when nothing matches', () => {
		expect(planBulkEdits('make it purple', EVENTS, TODAY)).toEqual([]);
	});
});
