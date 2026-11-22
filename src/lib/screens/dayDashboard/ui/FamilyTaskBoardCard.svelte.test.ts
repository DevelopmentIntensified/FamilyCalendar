/**
 * Family Task Board: the board's own open count, the roster's empty columns, an
 * ex-member's column, and the quick-add's inline refusal. Writes go to a state
 * class built on a fake api.
 *
 * Doc: ../README.md#invariants
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import type { TasksApi } from '$lib/domains/tasks';
import FamilyTaskBoardCard from './FamilyTaskBoardCard.svelte';
import { DayDashboardState } from '../dayDashboard.state.svelte';
import type { DashboardFamilyTaskRow, DashboardRosterRow } from '../dayDashboard.contract';

afterEach(cleanup);

type Call = { readonly method: string; readonly args: readonly unknown[] };

function buildState(): { state: DayDashboardState; calls: Call[]; refresh: ReturnType<typeof vi.fn> } {
	const calls: Call[] = [];
	const api = new Proxy({}, {
		get: (_target, method: string) =>
			async (...args: unknown[]) => {
				calls.push({ method, args });
				return { ok: true, data: { success: true, task: { id: 'task-new' } } };
			}
	}) as TasksApi;
	const refresh = vi.fn(async () => {});
	const state = new DayDashboardState({
		api,
		toasts: memoryToasts(),
		refresh,
		roster: MEMBERS,
		familyId: 'family-chen',
		meId: 'user-me',
		zone: 'UTC',
		clock: () => new Date(2026, 10, 2, 12, 0, 0, 0)
	});
	return { state, calls, refresh };
}

const MEMBERS: DashboardRosterRow[] = [
	{ userId: 'user-me', firstName: 'Riley', lastName: 'Chen', email: null, role: 'owner', memberType: 'parent' },
	{ userId: 'user-mia', firstName: 'Mia', lastName: 'Rivera', email: null, role: 'member', memberType: 'child' }
];

function row(overrides: Partial<DashboardFamilyTaskRow> = {}): DashboardFamilyTaskRow {
	return {
		id: 'task-cat',
		title: 'Feed cat',
		notes: null,
		dueDate: null,
		completedAt: null,
		archivedAt: null,
		recurrenceFrequency: null,
		recurrenceInterval: null,
		completionCount: 0,
		assignedTo: 'user-mia',
		assignmentStatus: 'accepted',
		priority: 'normal',
		visibility: 'public',
		focusMinutes: null,
		focusStartedAt: null,
		category: null,
		assigneeFirstName: 'Mia',
		assigneeLastName: 'Rivera',
		userId: 'user-mia',
		familyId: 'family-chen',
		eventId: null,
		createdAt: '2026-10-30T00:00:00.000Z',
		eventTitle: null,
		eventStart: null,
		creatorFirstName: 'Mia',
		tags: [],
		...overrides
	};
}

function renderCard(tasks: DashboardFamilyTaskRow[], weekStreak = 0) {
	const { state, calls, refresh } = buildState();
	render(FamilyTaskBoardCard, {
		props: {
			tasks,
			members: MEMBERS,
			meId: 'user-me',
			familyId: 'family-chen',
			weekStreak,
			categories: [],
			state,
			now: new Date(2026, 10, 2, 12, 0, 0, 0)
		}
	});
	return { state, calls, refresh };
}

describe('FamilyTaskBoardCard', () => {
	it('header counts every open task on the board, plus the streak', () => {
		renderCard([row(), row({ id: 'task-room', title: 'Tidy room', assignedTo: null, userId: 'user-me' })], 3);
		expect(screen.getByText(/2 open/)).toBeTruthy();
		expect(screen.getByText(/3-week streak/)).toBeTruthy();
	});

	it('keeps the legacy "?" help between the title field and Add, opening the quick-add grammar', async () => {
		renderCard([]);
		const help = screen.getByRole('button', { name: 'Quick-add shortcuts help' });
		expect(help).toHaveAttribute('aria-expanded', 'false');
		expect(help).toHaveClass('h-11', 'w-11');
		// Legacy order: title field, "?", Add.
		const add = screen.getByRole('button', { name: 'Add' });
		expect(help.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

		await fireEvent.click(help);
		expect(help).toHaveAttribute('aria-expanded', 'true');
		expect(screen.getByText('Type these right in the title')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		expect(screen.queryByText('Type these right in the title')).toBeNull();
	});

	it('invites a streak when there is none', () => {
		renderCard([], 0);
		expect(screen.getByText(/Start a streak — check off today's tasks/)).toBeTruthy();
		expect(screen.getByText('No open family tasks — enjoy the calm 👪.')).toBeTruthy();
	});

	it('gives a member with nothing assigned a column that says so', () => {
		renderCard([row({ assignedTo: 'user-mia' })]);
		expect(screen.getByText('nothing assigned')).toBeTruthy();
	});

	it('keeps a column for somebody who is no longer in the roster', () => {
		renderCard([
			row({ id: 'task-gone', title: 'Old chore', assignedTo: 'user-left', userId: 'user-left' })
		]);
		// The id's first 8 characters name the ex-member (legacy `memberName`).
		expect(screen.getByText('user-lef')).toBeTruthy();
		expect(screen.getByText('Old chore')).toBeTruthy();
	});

	it('blocks an unknown @member inline, keeps the input, and sends nothing', async () => {
		const { state, calls } = renderCard([]);
		const input = screen.getByTestId('board-quick-add');
		await fireEvent.input(input, { target: { value: 'call @Nobody' } });
		expect(state.quickTitle).toBe('call @Nobody');
		await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
		// The parser loads on the first quick-add (a dynamic import), so the
		// refusal lands a microtask later.
		await waitFor(() =>
			expect(screen.getByRole('alert').textContent).toContain('Unknown member @Nobody')
		);
		expect(state.quickTitle).toBe('call @Nobody');
		expect(calls).toEqual([]);
	});
});
