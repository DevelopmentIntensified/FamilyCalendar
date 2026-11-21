/**
 * Top-3 Priorities: the two labelled groups with continuous numbering, the
 * scope/assignee marks, the priority buttons and the empty state. Writes go to
 * a state class built on a fake api.
 *
 * Doc: ../README.md#invariants
 */
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import type { TasksApi } from '$lib/domains/tasks';
import TopPrioritiesCard from './TopPrioritiesCard.svelte';
import { DayDashboardState } from '../dayDashboard.state.svelte';
import type { DashboardUserTaskRow } from '../dayDashboard.contract';

afterEach(cleanup);

const api = new Proxy({}, {
	get: () => async () => ({ ok: true, data: {} })
}) as TasksApi;

function buildState() {
	return new DayDashboardState({
		api,
		toasts: memoryToasts(),
		refresh: async () => {},
		roster: [],
		familyId: 'family-chen',
		meId: 'user-me',
		zone: 'UTC'
	});
}

function row(overrides: Partial<DashboardUserTaskRow> = {}): DashboardUserTaskRow {
	return {
		id: 'task-rent',
		title: 'Pay rent',
		notes: null,
		dueDate: null,
		completedAt: null,
		archivedAt: null,
		recurrenceFrequency: null,
		recurrenceInterval: null,
		completionCount: 0,
		assignedTo: null,
		assignmentStatus: 'none',
		priority: 'normal',
		visibility: 'public',
		focusMinutes: null,
		focusStartedAt: null,
		category: null,
		assigneeFirstName: null,
		assigneeLastName: null,
		userId: 'user-me',
		familyId: null,
		eventId: null,
		createdAt: '2026-10-01T00:00:00.000Z',
		eventTitle: null,
		eventStart: null,
		eventCalendarId: null,
		tags: [],
		...overrides
	};
}

describe('TopPrioritiesCard', () => {
	it('shows the all-clear empty state with the tasks link', () => {
		render(TopPrioritiesCard, {
			props: { tasks: [], meId: 'user-me', state: buildState(), now: new Date(2026, 10, 2) }
		});
		expect(screen.getByText('All clear — nothing needs you right now.')).toBeTruthy();
		expect(screen.getByText('All clear')).toBeTruthy();
		expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', '/calendar/tasks');
	});

	it('labels the two groups and numbers continuously across them', () => {
		render(TopPrioritiesCard, {
			props: {
				meId: 'user-me',
				state: buildState(),
				now: new Date(2026, 10, 2),
				tasks: [
					row({ id: 'task-one', title: 'Pay rent' }),
					row({ id: 'task-two', title: 'Practice piano', recurrenceFrequency: 'daily' })
				]
			}
		});
		expect(screen.getByTestId('top3-one-off').textContent).toContain('One-off');
		expect(screen.getByTestId('top3-recurring').textContent).toContain('Recurring');
		const rows = screen.getAllByRole('listitem');
		expect(rows[0]?.textContent).toContain('1');
		expect(rows[1]?.textContent).toContain('2');
	});

	it('marks the scope and shows "→ Name" when assigned to somebody else', () => {
		render(TopPrioritiesCard, {
			props: {
				meId: 'user-me',
				state: buildState(),
				now: new Date(2026, 10, 2),
				tasks: [
					row({
						title: 'Tidy room',
						familyId: 'family-chen',
						assignedTo: 'user-mia',
						assigneeFirstName: 'Mia',
						assigneeLastName: 'Rivera'
					})
				]
			}
		});
		expect(screen.getByText('Family')).toBeTruthy();
		expect(screen.getByText('→ Mia Rivera')).toBeTruthy();
	});

	it('offers the three priority buttons and the complete circle', () => {
		render(TopPrioritiesCard, {
			props: {
				meId: 'user-me',
				state: buildState(),
				now: new Date(2026, 10, 2),
				tasks: [row({ title: 'Pay rent', priority: 'high' })]
			}
		});
		expect(screen.getByRole('button', { name: 'Set priority High' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Set priority Normal' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Set priority Low' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Mark done: Pay rent' })).toBeTruthy();
	});
});
