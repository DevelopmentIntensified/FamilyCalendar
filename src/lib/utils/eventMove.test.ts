import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import {
	snapMinutes,
	minutesToDayTime,
	yToMinutes,
	normalizeRange,
	formatRangeLabel,
	eventDurationMinutes,
	buildMovePayload
} from './eventMove';

const DAY = DateTime.fromISO('2026-09-07T00:00:00');

describe('snapMinutes', () => {
	const cases: Array<[number, number]> = [
		[0, 0],
		[7, 0],
		[8, 15],
		[60, 60],
		[1439, 1425],
		[-30, 0]
	];
	for (const [input, expected] of cases) {
		it(`snaps ${input} to ${expected}`, () => {
			expect(snapMinutes(input)).toBe(expected);
		});
	}
});

describe('minutesToDayTime / yToMinutes', () => {
	it('maps minutes onto the given day', () => {
		expect(minutesToDayTime(DAY, 90).toISODate()).toBe('2026-09-07');
		expect(minutesToDayTime(DAY, 90).hour).toBe(1);
		expect(minutesToDayTime(DAY, 90).minute).toBe(30);
	});

	it('maps pointer Y to snapped minutes (60px/hour grid)', () => {
		expect(yToMinutes(120, 0, 60)).toBe(120);
		expect(yToMinutes(100, 0, 60)).toBe(105);
	});

	it('maps pointer Y on the 56px day grid', () => {
		expect(yToMinutes(56, 0, 56)).toBe(60);
	});
});

describe('normalizeRange', () => {
	it('orders anchor and current regardless of drag direction', () => {
		expect(normalizeRange(240, 120)).toEqual([120, 240]);
		expect(normalizeRange(120, 240)).toEqual([120, 240]);
	});

	it('snaps both ends to the grid', () => {
		expect(normalizeRange(122, 248)).toEqual([120, 255]);
	});

	it('expands degenerate drags to 30 minutes', () => {
		expect(normalizeRange(120, 120)).toEqual([120, 150]);
		expect(normalizeRange(120, 125)).toEqual([120, 150]);
	});
});

describe('formatRangeLabel', () => {
	const cases: Array<[number, number, string]> = [
		[120, 240, '2:00 AM – 4:00 AM'],
		[840, 930, '2:00 PM – 3:30 PM'],
		[720, 780, '12:00 PM – 1:00 PM'],
		[0, 60, '12:00 AM – 1:00 AM']
	];
	for (const [start, end, expected] of cases) {
		it(`labels ${start}–${end} as "${expected}"`, () => {
			expect(formatRangeLabel(start, end)).toBe(expected);
		});
	}
});

describe('eventDurationMinutes', () => {
	it('measures real durations and floors at 15', () => {
		expect(eventDurationMinutes('2026-09-07T10:00:00', '2026-09-07T11:30:00')).toBe(90);
		expect(eventDurationMinutes('2026-09-07T10:00:00', '2026-09-07T10:10:00')).toBe(15);
	});

	it('defaults to 60 when missing or invalid', () => {
		expect(eventDurationMinutes('2026-09-07T10:00:00', null)).toBe(60);
		expect(eventDurationMinutes('2026-09-07T10:00:00', '2026-09-07T09:00:00')).toBe(60);
		expect(eventDurationMinutes('nope', null)).toBe(60);
	});
});

describe('buildMovePayload', () => {
	const oneOff = {
		id: 'e1',
		title: 'Lunch',
		start: '2026-09-07T12:00:00',
		end: '2026-09-07T13:00:00',
		description: null,
		location: null
	} as any;

	it('moves one-offs preserving duration', () => {
		const payload = buildMovePayload(oneOff, { day: DAY, minutes: 600 });
		expect(payload.start).toContain('2026-09-07T10:00');
		expect(payload.end).toContain('2026-09-07T11:00');
		expect(payload.scope).toBeUndefined();
	});

	it('moves across days keeping wall time', () => {
		const payload = buildMovePayload(oneOff, {
			day: DateTime.fromISO('2026-09-09T00:00:00'),
			minutes: 720
		});
		expect(payload.start).toContain('2026-09-09T12:00');
	});

	it('moves recurring events as scope:this with occurrence fallback', () => {
		const payload = buildMovePayload(
			{ ...oneOff, recurrenceFrequency: 'weekly', masterId: 'm1', occurrenceDate: null },
			{ day: DAY, minutes: 600 }
		);
		expect(payload.scope).toBe('this');
		expect(payload.occurrenceDate).toBe('2026-09-07');
		expect(payload.title).toBe('Lunch');
	});
});
