import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import TaskDetailModal from './TaskDetailModal.svelte';

const baseTask = {
	id: 'task1',
	title: 'Pay water bill',
	dueDate: '2026-09-03',
	completedAt: null
};

describe('TaskDetailModal - onClose callback convention', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	it('notifies the parent via onClose on X so selection state can clear', async () => {
		const onClose = vi.fn();
		render(TaskDetailModal, {
			props: { task: baseTask, onClose }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('notifies the parent via onClose on backdrop click too', async () => {
		const onClose = vi.fn();
		const { container } = render(TaskDetailModal, {
			props: { task: baseTask, onClose }
		});
		// Backdrop is the fixed inset layer behind the panel.
		const backdrop = container.querySelector('.fixed.inset-0');
		expect(backdrop).not.toBeNull();
		await fireEvent.click(backdrop!);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('notifies the parent via onClose on Escape too', async () => {
		const onClose = vi.fn();
		render(TaskDetailModal, {
			props: { task: baseTask, onClose }
		});
		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
