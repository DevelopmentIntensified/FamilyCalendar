import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import EventActionBar from './EventActionBar.svelte';

function props(overrides = {}) {
	return {
		isEditMode: false,
		entryType: 'event',
		submitting: false,
		canSubmit: true,
		submitBlockedReason: undefined,
		onDelete: vi.fn(),
		onClose: vi.fn(),
		onClear: vi.fn(),
		...overrides
	};
}

describe('EventActionBar', () => {
	afterEach(cleanup);

	it('create mode: clear + create, no delete', async () => {
		const p = props();
		render(EventActionBar, { props: p });
		expect(screen.queryByText(/^Delete$/)).toBeNull();
		await fireEvent.click(screen.getByText('Clear'));
		expect(p.onClear).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByText('Create'));
		expect(p.onClose).not.toHaveBeenCalled();
	});

	it('edit mode: delete + update, spinner while submitting', async () => {
		const p = props({ isEditMode: true, submitting: true });
		render(EventActionBar, { props: p });
		await fireEvent.click(screen.getByText(/^Delete$/));
		expect(p.onDelete).toHaveBeenCalledOnce();
		expect(screen.getByText('Updating...')).toBeTruthy();
	});

	it('disables submit when blocked, with the reason as title', () => {
		const p = props({ canSubmit: false, submitBlockedReason: 'End must be after start' });
		render(EventActionBar, { props: p });
		// SAFETY: the Create affordance is a submit <button> in EventActionBar.
		const btn = screen.getByText('Create').closest('button') as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
		expect(btn.title).toBe('End must be after start');
	});

	it('task mode labels the submit Add Task', () => {
		const p = props({ entryType: 'task' });
		render(EventActionBar, { props: p });
		expect(screen.getByText('Add Task')).toBeTruthy();
		expect(screen.queryByText('Clear')).toBeNull();
	});
});
