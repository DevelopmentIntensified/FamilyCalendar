import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import BottomSheetHandle from './BottomSheetHandle.svelte';

afterEach(cleanup);

describe('BottomSheetHandle', () => {
	it('renders the grab affordance', () => {
		const { container } = render(BottomSheetHandle, {
			props: { onDragStart: vi.fn(), onDragMove: vi.fn(), onDragEnd: vi.fn() }
		});
		expect(container.querySelector('[data-drag-handle]')).not.toBeNull();
	});

	it('forwards the swipe lifecycle', async () => {
		const onDragStart = vi.fn();
		const onDragMove = vi.fn();
		const onDragEnd = vi.fn();
		const { container } = render(BottomSheetHandle, {
			props: { onDragStart, onDragMove, onDragEnd }
		});
		const handle = container.querySelector('[data-drag-handle]')!;
		await fireEvent.touchStart(handle);
		await fireEvent.touchMove(handle);
		await fireEvent.touchEnd(handle);
		expect(onDragStart).toHaveBeenCalledOnce();
		expect(onDragMove).toHaveBeenCalledOnce();
		expect(onDragEnd).toHaveBeenCalledOnce();
	});
});
