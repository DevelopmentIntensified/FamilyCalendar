import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import TaskRow from './TaskRow.svelte';

const baseTask = {
	id: 't1',
	title: 'Buy milk',
	notes: null,
	dueDate: null,
	completedAt: null,
	recurrenceFrequency: null,
	recurrenceInterval: null,
	completionCount: null,
	assignedTo: null,
	assignmentStatus: null,
	priority: 'normal',
	familyId: null,
	visibility: 'public',
	assigneeFirstName: null,
	assigneeLastName: null,
	userId: 'u1',
	eventId: null,
	tags: []
};

function props(overrides = {}) {
	return {
		task: { ...baseTask },
		currentUserId: 'u1',
		assigneeName: '',
		busy: false,
		celebrating: false,
		confirmDelete: false,
		onToggle: vi.fn(),
		onEdit: vi.fn(),
		onAccept: vi.fn(),
		onDecline: vi.fn(),
		onAdvance: vi.fn(),
		onDelete: vi.fn(),
		onAskDelete: vi.fn(),
		onCancelDelete: vi.fn(),
		...overrides
	};
}

describe('TaskRow', () => {
	afterEach(cleanup);

	it('renders the title and fires onEdit when the title is clicked', async () => {
		const p = props();
		render(TaskRow, { props: p });
		await fireEvent.click(screen.getByTitle('Edit task'));
		expect(p.onEdit).toHaveBeenCalledOnce();
	});

	it('fires onToggle when the complete button is clicked', async () => {
		const p = props();
		render(TaskRow, { props: p });
		await fireEvent.click(screen.getByLabelText('Complete task'));
		expect(p.onToggle).toHaveBeenCalledOnce();
	});

	it('shows due + priority chips when set', () => {
		const p = props({
			task: { ...baseTask, dueDate: '2026-09-10', priority: 'high' }
		});
		render(TaskRow, { props: p });
		expect(screen.getByText('High')).toBeTruthy();
	});

	it('shows accept/decline for my pending assignment', async () => {
		const p = props({
			task: { ...baseTask, assignedTo: 'u1', assignmentStatus: 'pending', userId: 'u2' }
		});
		render(TaskRow, { props: p });
		await fireEvent.click(screen.getByTitle('Accept'));
		expect(p.onAccept).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByTitle('Decline'));
		expect(p.onDecline).toHaveBeenCalledOnce();
	});

	it('asks then confirms delete across two steps', async () => {
		const ask = props();
		const { unmount } = render(TaskRow, { props: ask });
		await fireEvent.click(screen.getByLabelText('Delete task'));
		expect(ask.onAskDelete).toHaveBeenCalledOnce();
		unmount();

		const confirm = props({ confirmDelete: true });
		render(TaskRow, { props: confirm });
		await fireEvent.click(screen.getByText('Yes'));
		expect(confirm.onDelete).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByText('No'));
		expect(confirm.onCancelDelete).toHaveBeenCalledOnce();
	});

	it('shows the skip button for open recurring tasks and fires onAdvance', async () => {
		const p = props({
			task: { ...baseTask, recurrenceFrequency: 'weekly', recurrenceInterval: 1 }
		});
		render(TaskRow, { props: p });
		await fireEvent.click(screen.getByLabelText('Skip to next occurrence'));
		expect(p.onAdvance).toHaveBeenCalledOnce();
	});

	it('disables actions while busy', () => {
		const p = props({ busy: true });
		render(TaskRow, { props: p });
		// SAFETY: getByLabelText on a <button> always returns an HTMLButtonElement here.
		expect((screen.getByLabelText('Complete task') as HTMLButtonElement).disabled).toBe(true);
		// SAFETY: same — the delete affordance is a <button> in TaskRow.
		expect((screen.getByLabelText('Delete task') as HTMLButtonElement).disabled).toBe(true);
	});
});
