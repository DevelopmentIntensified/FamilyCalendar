import { describe, it, expect, vi, afterEach } from 'vitest';
import { DateTime } from 'luxon';
import { RangeSelectMachine } from './rangeSelect';

const MONDAY = DateTime.fromISO('2026-09-07T12:00:00');

function machine(pxPerHour = 60) {
	return new RangeSelectMachine(pxPerHour, 450);
}

describe('RangeSelectMachine — mouse drag (#046)', () => {
	it('drags a range and finalizes on mouse-up', () => {
		const rs = machine();
		rs.beginDrag(MONDAY, 120);
		rs.dragTo(240, rs.mouseMinDelta());
		rs.endDrag();
		expect(rs.selecting).toBeNull();
		expect(rs.rangeSel).toEqual({ day: MONDAY, startMin: 120, endMin: 240 });
	});

	it('plain taps clear without finalizing (fall through to create)', () => {
		const rs = machine();
		rs.beginDrag(MONDAY, 120);
		rs.endDrag();
		expect(rs.rangeSel).toBeNull();
		expect(rs.selecting).toBeNull();
	});

	it('normalizes reversed drags', () => {
		const rs = machine();
		rs.beginDrag(MONDAY, 240);
		rs.dragTo(120, rs.mouseMinDelta());
		rs.endDrag();
		expect(rs.rangeSel).toEqual({ day: MONDAY, startMin: 120, endMin: 240 });
	});

	it('mouse threshold scales with pxPerHour (56 vs 60 grids)', () => {
		expect(machine(60).mouseMinDelta()).toBe(6);
		expect(machine(56).mouseMinDelta()).toBeCloseTo(6.43, 1);
	});

	it('consumeSuppressClick is one-shot', () => {
		const rs = machine();
		rs.beginDrag(MONDAY, 120);
		rs.dragTo(240, rs.mouseMinDelta());
		rs.endDrag();
		expect(rs.consumeSuppressClick()).toBe(true);
		expect(rs.consumeSuppressClick()).toBe(false);
	});

	it('steppers clamp to 15min minimum and midnight', () => {
		const rs = machine();
		rs.beginDrag(MONDAY, 120);
		rs.dragTo(240, rs.mouseMinDelta());
		rs.endDrag();
		rs.stepEnd(-500);
		expect(rs.rangeSel!.endMin).toBe(135);
		rs.stepEnd(5000);
		expect(rs.rangeSel!.endMin).toBe(1440);
	});

	it('rangeEndpoints resolves datetimes on the selecting day', () => {
		const rs = machine();
		rs.beginDrag(MONDAY, 120);
		rs.dragTo(240, rs.mouseMinDelta());
		rs.endDrag();
		const ep = rs.rangeEndpoints();
		expect(ep!.start.toFormat('HH:mm')).toBe('02:00');
		expect(ep!.end.toFormat('HH:mm')).toBe('04:00');
		expect(ep!.start.hasSame(MONDAY, 'day')).toBe(true);
	});
});

describe('RangeSelectMachine — touch (#046, #047)', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('long-press selects a default one-hour block', () => {
		vi.useFakeTimers();
		const rs = machine();
		const onFire = vi.fn();
		rs.touchStart(MONDAY, 120, 120, { selectionMode: false, addMode: false }, onFire);
		vi.advanceTimersByTime(500);
		expect(onFire).toHaveBeenCalledTimes(1);
		expect(rs.rangeSel).toEqual({ day: MONDAY, startMin: 120, endMin: 180 });
		expect(rs.suppressClick).toBe(true);
		rs.destroy();
	});

	it('moving before the long-press fires cancels it (scroll)', () => {
		vi.useFakeTimers();
		const rs = machine();
		const onFire = vi.fn();
		rs.touchStart(MONDAY, 120, 120, { selectionMode: false, addMode: false }, onFire);
		rs.touchMove(135, null, false);
		vi.advanceTimersByTime(500);
		expect(onFire).not.toHaveBeenCalled();
		expect(rs.selecting).toBeNull();
		rs.destroy();
	});

	it('selection mode owns all taps (no-op)', () => {
		vi.useFakeTimers();
		const rs = machine();
		const onFire = vi.fn();
		rs.touchStart(MONDAY, 120, 120, { selectionMode: true, addMode: false }, onFire);
		vi.advanceTimersByTime(500);
		expect(onFire).not.toHaveBeenCalled();
		rs.destroy();
	});

	it('add mode drags immediately with no timer', () => {
		const rs = machine();
		rs.touchStart(MONDAY, 120, 120, { selectionMode: false, addMode: true }, vi.fn());
		rs.touchMove(0, 240, true);
		rs.touchEnd(true);
		expect(rs.rangeSel).toEqual({ day: MONDAY, startMin: 120, endMin: 240 });
		rs.destroy();
	});

	it('add mode plain taps clear (fall through to create)', () => {
		const rs = machine();
		rs.touchStart(MONDAY, 120, 120, { selectionMode: false, addMode: true }, vi.fn());
		rs.touchEnd(true);
		expect(rs.rangeSel).toBeNull();
		expect(rs.selecting).toBeNull();
		rs.destroy();
	});

	it('minutesFromClientY honors pxPerHour', () => {
		expect(machine(60).minutesFromClientY(120, 0)).toBe(120);
		expect(machine(56).minutesFromClientY(112, 0)).toBe(120);
	});
});
