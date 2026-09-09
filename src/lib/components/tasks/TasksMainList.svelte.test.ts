import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach, vi } from 'vitest';
import TasksMainList from './TasksMainList.svelte';
import type { TaskChip } from './TaskToolbar.svelte';

const task = (overrides = {}) => ({
	id: 't1',
	title: 'Buy milk',
	notes: null,
	dueDate: null,
	completedAt: null,
	assignedTo: null,
	assignmentStatus: null,
	priority: null,
	familyId: null,
	assigneeFirstName: null,
	userId: 'u1',
	eventTitle: null,
	tags: [],
	...overrides
});

function props(overrides = {}) {
	return {
		chip: 'all' as TaskChip,
		searchQuery: '',
		sortBy: 'due' as const,
		tagFilter: '',
		confirmClear: false,
		loaded: true,
		openCount: 1,
		completedCount: 0,
		completedThisWeek: 0,
		filteredOpen: [task()],
		filteredCompleted: [],
		currentUserId: 'u1',
		busyId: null,
		celebratingId: null,
		confirmDeleteId: null,
		clearBusy: false,
		assigneeName: () => '',
		onToggle: vi.fn(),
		onEdit: vi.fn(),
		onRespond: vi.fn(),
		onAdvance: vi.fn(),
		onDelete: vi.fn(),
		onAskDelete: vi.fn(),
		onCancelDelete: vi.fn(),
		onBeginClear: vi.fn(),
		onCancelClear: vi.fn(),
		onClearCompleted: vi.fn(),
		...overrides
	};
}

describe('TasksMainList', () => {
	afterEach(cleanup);

	it('renders open rows', () => {
		render(TasksMainList, { props: props() });
		expect(screen.getByText('Buy milk')).toBeTruthy();
		expect(screen.getByText(/Open \(1\)/)).toBeTruthy();
	});

	it('shows empty state when no tasks', () => {
		render(TasksMainList, { props: props({ filteredOpen: [], openCount: 0 }) });
		expect(screen.getByText('No tasks yet')).toBeTruthy();
	});

	it('shows skeleton while loading', () => {
		render(TasksMainList, { props: props({ loaded: false, filteredOpen: [] }) });
		expect(screen.queryByText('Buy milk')).toBeNull();
	});

	it('forwards row toggle', async () => {
		const p = props();
		render(TasksMainList, { props: p });
		await fireEvent.click(screen.getByLabelText('Complete task'));
		expect(p.onToggle).toHaveBeenCalledWith('t1');
	});
});
