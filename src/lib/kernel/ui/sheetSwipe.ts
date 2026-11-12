/**
 * Swipe-to-close maths for a bottom sheet, folded out of the legacy
 * `$lib/components/calendar/bottomSheetSwipe.ts` (#039: EventModal and
 * EventFormModal ran byte-identical copies). Immutable transitions: the
 * component reassigns its `$state`, which keeps Svelte's reactivity and lets
 * the maths be tested without a DOM.
 *
 * The legacy threshold was "more than 100 px down closes"; upward drags clamp
 * at 0. Both are pinned by sheetSwipe.test.ts.
 *
 * Doc: src/lib/kernel/README.md
 */

/** Pixel offset of the drag below the start point; 0 at rest. */
export interface SheetSwipe {
	dragging: boolean;
	startY: number;
	offset: number;
	transition: boolean;
}

const CLOSE_OFFSET_PX = 100;

export function createSheetSwipe(): SheetSwipe {
	return { dragging: false, startY: 0, offset: 0, transition: false };
}

export function startSheetSwipe(clientY: number): SheetSwipe {
	return { dragging: true, startY: clientY, offset: 0, transition: false };
}

/** Unknown without an active drag, so the state is returned untouched. */
export function moveSheetSwipe(state: SheetSwipe, clientY: number): SheetSwipe {
	if (!state.dragging) return state;
	return { ...state, offset: Math.max(0, clientY - state.startY) };
}

export interface SheetSwipeEnd {
	state: SheetSwipe;
	/** True when the drag passed the legacy close threshold. */
	closed: boolean;
}

export function endSheetSwipe(state: SheetSwipe): SheetSwipeEnd {
	if (!state.dragging) return { state, closed: false };
	const closed = state.offset > CLOSE_OFFSET_PX;
	return {
		state: { ...state, dragging: false, transition: true, offset: 0 },
		closed
	};
}
