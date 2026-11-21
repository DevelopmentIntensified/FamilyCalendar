/**
 * Pure range-select rules: the mouse drag, the touch long-press, Add mode, the
 * steppers and the click guard. Expected values come from the legacy table
 * `src/lib/utils/rangeSelect.test.ts` and the README Invariants, never from
 * running this code.
 *
 * Doc: ./README.md#day-and-week-views
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';
import { RangeSelectMachine } from './calendarPage.select.rules';

const MONDAY = DateTime.fromISO('2026-09-07T12:00:00');

function machine(pxPerHour = 60): RangeSelectMachine {
	return new RangeSelectMachine(pxPerHour, 450);
}

describe('RangeSelectMachine — mouse drag (#046)', () => {
	it('drags a range and finalizes on mouse-up', () => {
		const select = machine();
		select.beginDrag(MONDAY, 120);
		select.dragTo(240, select.mouseMinDelta());
		select.endDrag();
		expect(select.selecting).toBeNull();
		expect(select.rangeSel).toEqual({ day: MONDAY, startMin: 120, endMin: 240 });
	});

	it('plain taps clear without finalizing (fall through to create)', () => {
		const select = machine();
		select.beginDrag(MONDAY, 120);
		select.endDrag();
		expect(select.rangeSel).toBeNull();
		expect(select.selecting).toBeNull();
	});

	it('normalizes reversed drags', () => {
		const select = machine();
		select.beginDrag(MONDAY, 240);
		select.dragTo(120, select.mouseMinDelta());
		select.endDrag();
		expect(select.rangeSel).toEqual({ day: MONDAY, startMin: 120, endMin: 240 });
	});

	it('mouse threshold scales with pxPerHour (56 vs 60 grids)', () => {
		expect(machine(60).mouseMinDelta()).toBe(6);
		expect(machine(56).mouseMinDelta()).toBeCloseTo(6.43, 1);
	});

	it('consumeSuppressClick is one-shot', () => {
		const select = machine();
		select.beginDrag(MONDAY, 120);
		select.dragTo(240, select.mouseMinDelta());
		select.endDrag();
		expect(select.consumeSuppressClick()).toBe(true);
		expect(select.consumeSuppressClick()).toBe(false);
	});

	it('steppers clamp to a 15min minimum and midnight', () => {
		const select = machine();
		select.beginDrag(MONDAY, 120);
		select.dragTo(240, select.mouseMinDelta());
		select.endDrag();
		select.stepEnd(-500);
		expect(select.rangeSel?.endMin).toBe(135);
		select.stepEnd(5000);
		expect(select.rangeSel?.endMin).toBe(1440);
	});

	it('rangeEndpoints resolves datetimes on the selecting day', () => {
		const select = machine();
		select.beginDrag(MONDAY, 120);
		select.dragTo(240, select.mouseMinDelta());
		select.endDrag();
		const endpoints = select.rangeEndpoints();
		expect(endpoints?.start.toFormat('HH:mm')).toBe('02:00');
		expect(endpoints?.end.toFormat('HH:mm')).toBe('04:00');
		expect(endpoints?.start.hasSame(MONDAY, 'day')).toBe(true);
	});
});

describe('RangeSelectMachine — touch (#046, #047)', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('a long press selects one hour; Add mode drags immediately', () => {
		vi.useFakeTimers();
		const pressed = machine();
		const onFire = vi.fn();
		pressed.touchStart(MONDAY, 120, 120, { selectionMode: false, addMode: false }, onFire);
		vi.advanceTimersByTime(500);
		expect(onFire).toHaveBeenCalledTimes(1);
		expect(pressed.rangeSel).toEqual({ day: MONDAY, startMin: 120, endMin: 180 });
		expect(pressed.suppressClick).toBe(true);
		pressed.destroy();
		vi.useRealTimers();

		const dragged = machine();
		dragged.touchStart(MONDAY, 120, 120, { selectionMode: false, addMode: true }, vi.fn());
		dragged.touchMove(0, 240, true);
		dragged.touchEnd(true);
		expect(dragged.rangeSel).toEqual({ day: MONDAY, startMin: 120, endMin: 240 });
		dragged.destroy();
	});

	it('moving before the long-press fires cancels it (scroll)', () => {
		vi.useFakeTimers();
		const select = machine();
		const onFire = vi.fn();
		select.touchStart(MONDAY, 120, 120, { selectionMode: false, addMode: false }, onFire);
		select.touchMove(135, null, false);
		vi.advanceTimersByTime(500);
		expect(onFire).not.toHaveBeenCalled();
		expect(select.selecting).toBeNull();
		select.destroy();
	});

	it('selection mode owns all taps (no-op)', () => {
		vi.useFakeTimers();
		const select = machine();
		const onFire = vi.fn();
		select.touchStart(MONDAY, 120, 120, { selectionMode: true, addMode: false }, onFire);
		vi.advanceTimersByTime(500);
		expect(onFire).not.toHaveBeenCalled();
		select.destroy();
	});

	it('add mode plain taps clear (fall through to create)', () => {
		const select = machine();
		select.touchStart(MONDAY, 120, 120, { selectionMode: false, addMode: true }, vi.fn());
		select.touchEnd(true);
		expect(select.rangeSel).toBeNull();
		expect(select.selecting).toBeNull();
		select.destroy();
	});

	it('minutesFromClientY honors pxPerHour', () => {
		expect(machine(60).minutesFromClientY(120, 0)).toBe(120);
		expect(machine(56).minutesFromClientY(112, 0)).toBe(120);
	});
});
