import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import TaskCompletedRow from './TaskCompletedRow.svelte';

const baseTask = {
	id: 't9',
	title: 'Done thing',
	dueDate: null,
	completedAt: '2026-09-07T10:00:00Z',
	recurrenceFrequency: null,
	eventTitle: null,
	tags: []
};

function props(overrides = {}) {
	return {
		task: { ...baseTask },
		busy: false,
		confirmDelete: false,
		onToggle: vi.fn(),
		onDelete: vi.fn(),
		onAskDelete: vi.fn(),
		onCancelDelete: vi.fn(),
		...overrides
	};
}

describe('TaskCompletedRow', () => {
	afterEach(cleanup);

	it('renders struck title and fires onToggle via Mark incomplete', async () => {
		const p = props();
		render(TaskCompletedRow, { props: p });
		await fireEvent.click(screen.getByLabelText('Mark incomplete'));
		expect(p.onToggle).toHaveBeenCalledOnce();
	});

	it('shows the recurrence chip when set', () => {
		const p = props({ task: { ...baseTask, recurrenceFrequency: 'monthly' } });
		render(TaskCompletedRow, { props: p });
		expect(screen.getByText('every month')).toBeTruthy();
	});

	it('asks then confirms delete across two steps', async () => {
		const ask = props();
		const { unmount } = render(TaskCompletedRow, { props: ask });
		await fireEvent.click(screen.getByLabelText('Delete task'));
		expect(ask.onAskDelete).toHaveBeenCalledOnce();
		unmount();

		const confirm = props({ confirmDelete: true });
		render(TaskCompletedRow, { props: confirm });
		await fireEvent.click(screen.getByText('Yes'));
		expect(confirm.onDelete).toHaveBeenCalledOnce();
	});
});
