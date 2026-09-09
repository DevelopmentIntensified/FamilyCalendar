import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import TaskDetailBar from './TaskDetailBar.svelte';

const handlers = () => ({
	onAdvance: vi.fn(),
	onRemove: vi.fn(),
	onBeginDelete: vi.fn(),
	onCancelDelete: vi.fn(),
	onToggleComplete: vi.fn()
});

afterEach(cleanup);

describe('TaskDetailBar', () => {
	it('renders skip + delete + complete actions by default', () => {
		render(TaskDetailBar, {
			props: { busy: false, showDeleteConfirm: false, canSkip: true, ...handlers() }
		});
		expect(screen.getByRole('button', { name: 'Skip occurrence' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Mark complete' })).toBeInTheDocument();
	});

	it('hides the skip button for one-off tasks', () => {
		render(TaskDetailBar, {
			props: { busy: false, showDeleteConfirm: false, canSkip: false, ...handlers() }
		});
		expect(screen.queryByRole('button', { name: 'Skip occurrence' })).not.toBeInTheDocument();
	});

	it('swaps delete for the two-step confirm', async () => {
		const h = handlers();
		render(TaskDetailBar, {
			props: { busy: false, showDeleteConfirm: false, canSkip: false, ...h }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		expect(h.onBeginDelete).toHaveBeenCalledOnce();
	});

	it('shows busy labels while working', () => {
		render(TaskDetailBar, {
			props: { busy: true, showDeleteConfirm: true, canSkip: false, ...handlers() }
		});
		expect(screen.getByRole('button', { name: 'Deleting…' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Working…' })).toBeInTheDocument();
	});
});
