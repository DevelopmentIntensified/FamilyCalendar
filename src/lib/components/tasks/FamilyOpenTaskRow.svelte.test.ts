import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import FamilyOpenTaskRow, { type OpenTask } from './FamilyOpenTaskRow.svelte';

const task: OpenTask = {
	id: 't1',
	title: 'Mow the lawn',
	dueDate: '2099-09-10',
	recurrenceFrequency: null,
	completionCount: null,
	assignedTo: null,
	assignmentStatus: null,
	assigneeFirstName: null,
	assigneeLastName: null,
	userId: 'u1',
	creatorFirstName: 'Bo',
	tags: ['yard']
};

const handlers = () => ({
	onToggle: vi.fn(),
	onAccept: vi.fn(),
	onDecline: vi.fn(),
	onAdvance: vi.fn(),
	onBeginDelete: vi.fn(),
	onCancelDelete: vi.fn(),
	onDelete: vi.fn()
});

const base = {
	task,
	currentUserId: 'u1',
	busy: false,
	confirmDelete: false
};

afterEach(cleanup);

describe('FamilyOpenTaskRow', () => {
	it('renders title, due, creator, and tags', () => {
		render(FamilyOpenTaskRow, { props: { ...base, ...handlers() } });
		expect(screen.getByText('Mow the lawn')).toBeInTheDocument();
		expect(screen.getByText('by Bo')).toBeInTheDocument();
		expect(screen.getByText('#yard')).toBeInTheDocument();
	});

	it('shows accept/decline for my pending handoffs', async () => {
		const h = handlers();
		render(FamilyOpenTaskRow, {
			props: {
				...base,
				...h,
				task: { ...task, assignedTo: 'u1', assignmentStatus: 'pending' }
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: '✓ Accept' }));
		expect(h.onAccept).toHaveBeenCalledOnce();
		await fireEvent.click(screen.getByRole('button', { name: '✕' }));
		expect(h.onDecline).toHaveBeenCalledOnce();
	});

	it('shows the skip affordance for own recurring tasks', () => {
		render(FamilyOpenTaskRow, {
			props: {
				...base,
				...handlers(),
				task: { ...task, recurrenceFrequency: 'weekly', completionCount: 3 }
			}
		});
		expect(screen.getByRole('button', { name: 'Skip to next occurrence' })).toBeInTheDocument();
		expect(screen.getByText('🔥 3×')).toBeInTheDocument();
	});

	it('runs the two-step delete confirm', async () => {
		const h = handlers();
		const { unmount } = render(FamilyOpenTaskRow, { props: { ...base, ...h } });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete task' }));
		expect(h.onBeginDelete).toHaveBeenCalledOnce();
		unmount();
		render(FamilyOpenTaskRow, { props: { ...base, ...h, confirmDelete: true } });
		await fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
		expect(h.onDelete).toHaveBeenCalledOnce();
	});
});
