/**
 * Pins the swipe-to-close maths folded out of the legacy `bottomSheetSwipe.ts`
 * (#039, EventModal + EventFormModal ran byte-identical copies). Expected
 * values are the legacy ones: a downward drag of more than 100 px closes,
 * exactly 100 px does not, and upward drags clamp at 0.
 *
 * Doc: src/lib/kernel/README.md
 */
import { describe, it, expect } from 'vitest';
import {
	createSheetSwipe,
	endSheetSwipe,
	moveSheetSwipe,
	startSheetSwipe
} from './sheetSwipe';

describe('sheetSwipe', () => {
	const drag = (startY: number, endY: number) => {
		const dragging = startSheetSwipe(startY);
		return moveSheetSwipe(dragging, endY);
	};

	it('tracks the downward offset and closes past the legacy 100 px threshold', () => {
		const s = drag(100, 250);
		expect(s).toMatchObject({ dragging: true, offset: 150, transition: false });
		const result = endSheetSwipe(s);
		expect(result.closed).toBe(true);
		expect(result.state).toMatchObject({ dragging: false, offset: 0, transition: true });
	});

	it.each([
		[100, 100, 0, false],
		[100, 199, 99, false],
		[100, 200, 100, false],
		[100, 201, 101, true],
		[100, 400, 300, true]
	])('drag %i → %i gives offset %i and closed %s', (startY, endY, offset, closed) => {
		const s = drag(startY, endY);
		expect(s.offset).toBe(offset);
		expect(endSheetSwipe(s).closed).toBe(closed);
	});

	it('clamps upward drags at zero', () => {
		const s = drag(200, 100);
		expect(s.offset).toBe(0);
		expect(endSheetSwipe(s).closed).toBe(false);
	});

	it('ignores moves and ends without an active drag', () => {
		const idle = createSheetSwipe();
		expect(moveSheetSwipe(idle, 500)).toBe(idle);
		const result = endSheetSwipe(idle);
		expect(result.state).toBe(idle);
		expect(result.closed).toBe(false);
	});
});
