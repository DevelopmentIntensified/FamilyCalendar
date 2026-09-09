/**
 * Shared bottom-sheet swipe-to-close (#039): EventModal and EventFormModal
 * ran byte-identical copies. Immutable transitions — components reassign
 * their top-level `swipe` let, which keeps legacy `export let` reactivity
 * (property mutation inside helpers would not invalidate).
 */

export interface SwipeState {
	dragging: boolean;
	dragStartY: number;
	dragOffset: number;
	dragTransition: boolean;
}

const CLOSE_OFFSET_PX = 100;

export function createSwipeState(): SwipeState {
	return { dragging: false, dragStartY: 0, dragOffset: 0, dragTransition: false };
}

export function startSwipe(state: SwipeState, clientY: number): SwipeState {
	return { dragging: true, dragStartY: clientY, dragOffset: 0, dragTransition: false };
}

export function moveSwipe(state: SwipeState, clientY: number): SwipeState {
	if (!state.dragging) return state;
	return { ...state, dragOffset: Math.max(0, clientY - state.dragStartY) };
}

export interface EndSwipeResult {
	state: SwipeState;
	closed: boolean;
}

export function endSwipe(state: SwipeState): EndSwipeResult {
	if (!state.dragging) return { state, closed: false };
	const closed = state.dragOffset > CLOSE_OFFSET_PX;
	return {
		state: { ...state, dragging: false, dragTransition: true, dragOffset: 0 },
		closed
	};
}
