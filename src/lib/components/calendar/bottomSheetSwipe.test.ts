import { describe, it, expect } from 'vitest';
import { createSwipeState, startSwipe, moveSwipe, endSwipe } from './bottomSheetSwipe';

describe('bottomSheetSwipe', () => {
	it('tracks a downward drag and closes past the threshold', () => {
		let s = createSwipeState();
		s = startSwipe(s, 100);
		s = moveSwipe(s, 250);
		expect(s.dragOffset).toBe(150);
		const r = endSwipe(s);
		expect(r.closed).toBe(true);
		expect(r.state.dragOffset).toBe(0);
		expect(r.state.dragging).toBe(false);
	});

	it('stays open for short drags and clamps upward drags at zero', () => {
		let s = startSwipe(createSwipeState(), 200);
		s = moveSwipe(s, 100);
		expect(s.dragOffset).toBe(0);
		expect(endSwipe(s).closed).toBe(false);
	});

	it('ignores moves/ends without an active drag', () => {
		const s = createSwipeState();
		expect(moveSwipe(s, 500)).toBe(s);
		expect(endSwipe(s).closed).toBe(false);
	});
});
