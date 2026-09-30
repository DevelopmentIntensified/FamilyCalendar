import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import TasksPage from './+page.svelte';
import type { PageData } from './$types';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/* is framework-injected; no DI seam exists.
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(() => Promise.resolve()) }));
vi.mock('$lib/client/toasts', () => ({ pushToast: vi.fn() }));

function makeData() {
	return {
		data: {
			user: { id: 'u1' },
			familyId: null,
			loadWarnings: [],
			familyMembers: [],
			taskLists: {
				myTasks: [
					{
						id: 't1',
						title: 'Wash the car',
						notes: null,
						dueDate: null,
						completedAt: '2026-09-28T10:00:00.000Z',
						userId: 'u1',
						eventId: null,
						createdAt: '2026-09-01T10:00:00.000Z',
						tags: []
					}
				]
			}
		} as unknown as PageData
	};
}

beforeEach(() => {
	// The clear never resolves: the point is what happens while it is in flight.
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init?: RequestInit) => {
			if (String(url) === '/api/tasks/completed' && init?.method === 'DELETE') {
				return new Promise(() => {});
			}
			return new Response(JSON.stringify({ ok: true }), { status: 200 });
		})
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const clearCalls = () =>
	vi
		.mocked(fetch)
		.mock.calls.filter(
			([u, i]) => String(u) === '/api/tasks/completed' && (i as RequestInit)?.method === 'DELETE'
		);

// Issue 015: "Clear completed" is a destructive tap, and a double tap must
// not fire two DELETEs. The guard lives in the page, so it is pinned here.
describe('tasks page — clear completed', () => {
	it('sends exactly one DELETE when the confirm is double-tapped', async () => {
		render(TasksPage, makeData());
		await fireEvent.click(screen.getByRole('button', { name: 'Clear completed' }));
		// SAFETY: the confirm affordance is a <button> in TasksMainList.
		const yes = screen.getByRole('button', { name: 'Yes, delete' });
		await fireEvent.click(yes);
		await fireEvent.click(yes);
		expect(clearCalls()).toHaveLength(1);
	});

	it('names the pending state and blocks a second tap', async () => {
		render(TasksPage, makeData());
		await fireEvent.click(screen.getByRole('button', { name: 'Clear completed' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
		const pending = screen.getByRole('button', { name: 'Deleting…' });
		expect(pending).toBeDisabled();
		await fireEvent.click(pending);
		expect(clearCalls()).toHaveLength(1);
		expect(clearCalls()[0][0]).toBe('/api/tasks/completed');
	});
});
