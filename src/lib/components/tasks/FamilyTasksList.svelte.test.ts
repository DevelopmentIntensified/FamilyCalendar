import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import FamilyTasksList from './FamilyTasksList.svelte';
import type { FamilyTask } from './FamilyTaskRow.svelte';

const task = (id: string, assignedTo: string | null = null): FamilyTask => ({
	id,
	title: `Task ${id}`,
	notes: null,
	dueDate: null,
	assignedTo,
	userId: 'u1'
});

const group = {
	member: { userId: 'u2', firstName: 'Bo' },
	tasks: [task('t1', 'u2')]
};

const wiring = () => ({
	canComplete: () => true,
	completeTitle: () => 'Complete task',
	assigneeName: () => 'Bo',
	overdue: () => false,
	busy: () => false,
	onToggle: vi.fn(),
	onAccept: vi.fn(),
	onDecline: vi.fn(),
	onAdvance: vi.fn(),
	onDelete: vi.fn()
});

const base = {
	byAssignee: [group],
	unassignedTasks: [task('t9')],
	completedTasks: [task('t8')],
	currentUserId: 'u1',
	memberName: () => 'Bo Jo'
};

afterEach(cleanup);

describe('FamilyTasksList', () => {
	it('renders assignee groups, unassigned, and completed sections', () => {
		render(FamilyTasksList, { props: { ...base, ...wiring() } });
		expect(screen.getByText('Bo Jo')).toBeInTheDocument();
		expect(screen.getByText('Unassigned')).toBeInTheDocument();
		expect(screen.getByText('Completed (1)')).toBeInTheDocument();
		expect(screen.getByText('Task t1')).toBeInTheDocument();
		expect(screen.getByText('Task t9')).toBeInTheDocument();
		expect(screen.getByText('Task t8')).toBeInTheDocument();
	});

	it('forwards row toggles', async () => {
		const w = wiring();
		render(FamilyTasksList, { props: { ...base, ...w } });
		const buttons = screen.getAllByRole('button', { name: 'Complete task' });
		expect(buttons.length).toBe(2);
		await fireEvent.click(buttons[0]);
		expect(w.onToggle).toHaveBeenCalledOnce();
	});
});
