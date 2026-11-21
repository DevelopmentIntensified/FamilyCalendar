/**
 * The Day Dashboard's three writes, in node: the board quick-add, the complete
 * toggle (with the recurring Undo) and a priority change. A fake api and
 * `memoryToasts` stand in for the browser, so nothing here needs a DOM.
 *
 * Expected copy comes from the legacy cards
 * (`FamilyTaskBoardCard.svelte:50-92`, `TopPrioritiesCard.svelte:66-118`).
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect, it, vi } from 'vitest';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import type { TasksApi } from '$lib/domains/tasks';
import { DayDashboardState } from './dayDashboard.state.svelte';

const NOW = new Date(2026, 10, 2, 12, 0, 0, 0);

type Call = { readonly method: string; readonly args: readonly unknown[] };

/** A complete fake client; each call is recorded so the test can inspect the body. */
function fakeApi(answers: {
	create?: () => Promise<unknown>;
	update?: () => Promise<unknown>;
} = {}): { api: TasksApi; calls: Call[] } {
	const calls: Call[] = [];
	const api = new Proxy({}, {
		get: (_target, method: string) =>
			async (...args: unknown[]) => {
				calls.push({ method, args });
				const answer =
					method === 'create'
						? answers.create?.()
						: method === 'update'
							? answers.update?.()
							: undefined;
				return answer ? await answer : { ok: true, data: {} };
			}
	}) as TasksApi;
	return { api, calls };
}

function build(api: TasksApi, refresh = vi.fn(async () => {})) {
	const toasts = memoryToasts();
	const state = new DayDashboardState({
		api,
		toasts,
		refresh,
		roster: [{ userId: 'user-dad', firstName: 'Dad', lastName: 'Chen', email: null, role: 'member', memberType: 'parent' }],
		familyId: 'family-chen',
		meId: 'user-me',
		zone: 'UTC',
		clock: () => NOW
	});
	return { state, toasts, refresh };
}

describe('DayDashboardState', () => {
	it('keeps the input and refuses inline for an unknown @member, sending nothing', async () => {
		const { api, calls } = fakeApi();
		const { state } = build(api);
		state.quickTitle = 'call @Nobody tomorrow';

		await state.addFamilyTask();

		expect(state.quickError).toContain('Unknown member @Nobody');
		expect(state.quickTitle).toBe('call @Nobody tomorrow');
		expect(calls).toEqual([]);
	});

	it('files the quick-add to the family, names it in the toast, clears the input and refreshes', async () => {
		const { api, calls } = fakeApi({
			create: async () => ({ ok: true, data: { success: true, task: { id: 'task-new' } } })
		});
		const { state, toasts, refresh } = build(api);
		state.quickTitle = 'saturday for Dad';
		state.quickCategory = 'Errands';

		await state.addFamilyTask();

		expect(calls.map((call) => call.method)).toEqual(['create']);
		expect(calls[0]?.args[0]).toMatchObject({
			title: expect.stringContaining('Dad'),
			familyId: 'family-chen',
			assignedTo: 'user-dad',
			category: 'Errands'
		});
		expect(toasts.items).toEqual([
			{ kind: 'success', text: expect.stringContaining('to the family board.') }
		]);
		expect(state.quickTitle).toBe('');
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it('toasts a one-off completion by name and refreshes', async () => {
		const { api } = fakeApi({ update: async () => ({ ok: true, data: { success: true, task: { id: 't' } } }) });
		const { state, toasts, refresh } = build(api);

		await state.toggleTask({ id: 'task-rent', title: 'Pay rent', dueDate: null, recurrenceFrequency: null });

		expect(toasts.items).toEqual([{ kind: 'success', text: '"Pay rent" marked done.' }]);
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it('gives a recurring completion only the streak toast with Undo, which sends undoComplete', async () => {
		const { api, calls } = fakeApi({
			update: async () => ({
				ok: true,
				data: {
					success: true,
					task: { id: 'task-piano', dueDate: '2026-11-03T23:59:00.000Z', recurrenceFrequency: 'daily' }
				}
			})
		});
		const { state, toasts } = build(api);

		await state.toggleTask({
			id: 'task-piano',
			title: 'Practice piano',
			dueDate: '2026-11-02T23:59:00.000Z',
			recurrenceFrequency: 'daily'
		});

		expect(toasts.items).toHaveLength(1);
		expect(toasts.items[0]?.kind).toBe('success');
		expect(toasts.items[0]?.text).toContain('counts toward your streak');
		expect(toasts.items[0]?.action?.label).toBe('Undo');

		toasts.items[0]?.action?.run();
		await vi.waitFor(() => {
			expect(calls.filter((call) => call.method === 'update')).toHaveLength(2);
		});
		expect(calls[1]?.args[1]).toEqual({
			undoComplete: true,
			previousDueDate: '2026-11-02T23:59:00.000Z'
		});
	});

	it('names the priority it set', async () => {
		const { api } = fakeApi({ update: async () => ({ ok: true, data: { success: true, task: { id: 't' } } }) });
		const { state, toasts } = build(api);

		await state.setPriority({ id: 'task-rent', title: 'Pay rent', dueDate: null, recurrenceFrequency: null }, 'high');

		expect(toasts.items).toEqual([{ kind: 'success', text: 'Priority for "Pay rent" set to High.' }]);
	});

	it('toasts the server refusal and never refreshes a failed write', async () => {
		const { api } = fakeApi({
			update: async () => ({ ok: false, status: 403, error: 'Task not found' })
		});
		const { state, toasts, refresh } = build(api);

		await state.toggleTask({ id: 'task-x', title: 'X', dueDate: null, recurrenceFrequency: null });

		expect(toasts.items).toEqual([{ kind: 'error', text: 'Task not found' }]);
		expect(refresh).not.toHaveBeenCalled();
	});
});
