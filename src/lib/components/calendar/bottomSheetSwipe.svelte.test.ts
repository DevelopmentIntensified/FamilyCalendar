import { describe, it, expect, vi } from 'vitest';
import {
	createSwipeHandlers,
	createSwipeState,
	type SwipeState
} from './bottomSheetSwipe';

describe('createSwipeHandlers', () => {
	// jsdom ships TouchEvent but no Touch constructor; the handlers only read
	// touches.length + touches[i].clientY, so plain fakes suffice.
	const touch = (...ys: number[]) => {
		const e = new TouchEvent('touchstart');
		Object.defineProperty(e, 'touches', { value: ys.map((clientY) => ({ clientY })) });
		return e;
	};

	function setup(canStart = true) {
		let swipe = createSwipeState();
		const onClose = vi.fn();
		const handlers = createSwipeHandlers({
			getState: () => swipe,
			setState: (s: SwipeState) => (swipe = s),
			canStart: () => canStart,
			onClose
		});
		return { handlers, state: () => swipe, onClose };
	}

	it('runs the full drag lifecycle and closes past the threshold', () => {
		const { handlers, state, onClose } = setup();
		handlers.onDragStart(touch(100));
		handlers.onDragMove(touch(250));
		expect(state().dragOffset).toBe(150);
		handlers.onDragEnd();
		expect(onClose).toHaveBeenCalledOnce();
		expect(state().dragOffset).toBe(0);
	});

	it('ignores multi-touch and a false canStart gate', () => {
		const gated = setup(false);
		gated.handlers.onDragStart(touch(100));
		expect(gated.state().dragging).toBe(false);

		const { handlers, state } = setup();
		handlers.onDragStart(touch(1, 2));
		expect(state().dragging).toBe(false);
	});
});
