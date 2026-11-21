/**
 * The board page's state class: the tabs and tag filter, the pending handoff
 * count, the grouping (viewer first, Nobody split), the accept/decline and
 * complete/skip/delete feedback, and the owner-only editor with its failure
 * toast. No DOM; a fake api and `memoryToasts()`.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it, vi } from 'vitest';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import type { TasksApi } from '$lib/domains/tasks/index';
import type { TaskEditDraft } from '$lib/domains/tasks/index';
import { FamilyBoardState } from './familyHub.board.state.svelte';
import { buildFamilyBoardModel, buildFamilyBoardTaskWire } from './familyHub.ui.fixtures';

const NOW = new Date('2026-09-30T10:00:00.000Z');

const draft: TaskEditDraft = {
	title: 'Mow the lawn',
	notes: '',
	tags: '',
	due: '',
	freq: '',
	interval: 1,
	assignedTo: '',
	priority: 'normal',
	visibility: 'public',
	category: ''
};

function fakeApi(overrides: Partial<TasksApi> = {}): TasksApi {
	const unexpected = async () => {
		throw new Error('unexpected api call');
	};
	return {
		listForEvent: unexpected,
		create: unexpected,
		update: unexpected,
		remove: unexpected,
		clearCompleted: unexpected,
		listCategories: unexpected,
		addCategory: unexpected,
		renameCategory: unexpected,
		removeCategory: unexpected,
		focusCommand: unexpected,
		listUnabsorbedSessions: unexpected,
		...overrides
	};
}

function buildState(options: { api?: TasksApi; model?: ReturnType<typeof buildFamilyBoardModel> } = {}) {
	const toasts = memoryToasts();
	const refresh = vi.fn(async () => {});
	const state = new FamilyBoardState({
		api: options.api ?? fakeApi(),
		toasts,
		refresh,
		data: options.model ?? buildFamilyBoardModel(),
		clock: () => NOW
	});
	return { state, toasts, refresh };
}

const okUpdate = (task = buildFamilyBoardTaskWire()) => async () => ({
	ok: true as const,
	data: { success: true as const, task }
});

describe('FamilyBoardState lists', () => {
	it('puts unassigned Tasks in the Nobody list only, never in a column', () => {
		const { state } = buildState({
			model: buildFamilyBoardModel({
				tasks: [
					buildFamilyBoardTaskWire({ id: 'mine', assignedTo: 'u_ann' }),
					buildFamilyBoardTaskWire({ id: 'bobs', assignedTo: 'u_bob', userId: 'u_bob' }),
					buildFamilyBoardTaskWire({ id: 'nobody', assignedTo: null, userId: 'u_ann' })
				]
			})
		});
		expect(state.unassignedTasks.map((task) => task.id)).toEqual(['nobody']);
		expect(state.boardGroups.map((column) => column.ownerId)).toEqual(['u_ann', 'u_bob']);
		const columnIds = state.boardGroups.flatMap((column) => column.tasks.map((task) => task.id));
		expect(columnIds).toEqual(['mine', 'bobs']);
	});

	it('orders columns viewer first and names them from the roster', () => {
		const { state } = buildState({
			model: buildFamilyBoardModel({
				tasks: [
					buildFamilyBoardTaskWire({ id: 'bobs', assignedTo: 'u_bob' }),
					buildFamilyBoardTaskWire({ id: 'mine', assignedTo: 'u_ann' })
				]
			})
		});
		expect(state.boardGroups.map((column) => column.name)).toEqual(['You', 'Bob Roy']);
	});

	it('filters both lists by the tag and keeps the Public tab count', () => {
		const { state } = buildState({
			model: buildFamilyBoardModel({
				tasks: [
					buildFamilyBoardTaskWire({ id: 'garden', tags: ['garden'] }),
					buildFamilyBoardTaskWire({ id: 'home', tags: ['home'] }),
					buildFamilyBoardTaskWire({
						id: 'done-garden',
						tags: ['garden'],
						completedAt: '2026-09-20 10:00:00+00'
					})
				],
				publicTasks: [buildFamilyBoardTaskWire({ id: 'public', tags: ['piano'] })]
			})
		});
		expect(state.publicLabel).toBe('Public tasks (1)');
		state.setTagFilter('gar');
		expect(state.openTasks.map((task) => task.id)).toEqual(['garden']);
		expect(state.completedTasks.map((task) => task.id)).toEqual(['done-garden']);
		expect(state.emptyState).toEqual({ kind: 'board' });
	});

	it('says which kind of empty the tab is', () => {
		const { state } = buildState({ model: buildFamilyBoardModel({ tasks: [], completedTotal: 0 }) });
		expect(state.emptyState).toEqual({ kind: 'no-family-tasks' });
		state.setTab('public');
		expect(state.emptyState).toEqual({ kind: 'no-public-tasks' });
	});

	it('counts the handoffs waiting for this viewer', () => {
		const { state } = buildState({
			model: buildFamilyBoardModel({
				tasks: [
					buildFamilyBoardTaskWire({ id: 'pending', assignedTo: 'u_ann', assignmentStatus: 'pending' }),
					buildFamilyBoardTaskWire({ id: 'accepted', assignmentStatus: 'accepted' }),
					buildFamilyBoardTaskWire({
						id: 'for-bob',
						assignedTo: 'u_bob',
						assignmentStatus: 'pending'
					})
				]
			})
		});
		expect(state.pendingForMe.map((task) => task.id)).toEqual(['pending']);
	});
});

describe('FamilyBoardState writes', () => {
	it('accept announces the move', async () => {
		const task = buildFamilyBoardTaskWire({ id: 'handoff', assignmentStatus: 'pending' });
		const { state, toasts, refresh } = buildState({ api: fakeApi({ update: okUpdate(task) }) });
		await state.respond(task, true);
		expect(toasts.items).toContainEqual({
			kind: 'success',
			text: 'Accepted "Mow the lawn" — it\'s on your list.'
		});
		expect(refresh).toHaveBeenCalled();
		expect(state.busyId).toBeNull();
	});

	it('decline returns it to the assigner with its own words', async () => {
		const task = buildFamilyBoardTaskWire({ id: 'handoff', assignmentStatus: 'pending' });
		const { state, toasts } = buildState({ api: fakeApi({ update: okUpdate(task) }) });
		await state.respond(task, false);
		expect(toasts.items).toContainEqual({ kind: 'success', text: 'Declined "Mow the lawn".' });
	});

	it('toasts the failure and keeps the dialog open', async () => {
		const task = buildFamilyBoardTaskWire();
		const { state, toasts } = buildState({
			api: fakeApi({ update: async () => ({ ok: false as const, status: 403, error: 'Not yours' }) })
		});
		state.openEdit(task);
		await state.saveEdit(draft);
		expect(state.editing?.id).toBe(task.id);
		expect(state.editSaving).toBe(false);
		expect(toasts.items).toContainEqual({
			kind: 'error',
			text: 'Couldn\'t save "Mow the lawn" — Not yours'
		});
	});

	it('closes the dialog and names the saved title on success', async () => {
		const task = buildFamilyBoardTaskWire();
		const { state, toasts } = buildState({ api: fakeApi({ update: okUpdate(task) }) });
		state.openEdit(task);
		await state.saveEdit(draft);
		expect(state.editing).toBeNull();
		expect(toasts.items).toContainEqual({ kind: 'success', text: 'Saved "Mow the lawn".' });
	});

	it('opens the editor for the owner only', () => {
		const { state } = buildState({
			model: buildFamilyBoardModel({ userId: 'u_bob' })
		});
		const annsTask = buildFamilyBoardTaskWire({ userId: 'u_ann' });
		state.openEdit(annsTask);
		expect(state.editing).toBeNull();
	});

	it('deletes an owned Task with the legacy toast and clears the ask', async () => {
		const task = buildFamilyBoardTaskWire();
		const { state, toasts } = buildState({
			api: fakeApi({ remove: async () => ({ ok: true as const, data: { success: true as const } }) })
		});
		state.beginDelete(task);
		expect(state.confirmDeleteId).toBe(task.id);
		await state.remove(task);
		expect(state.confirmDeleteId).toBeNull();
		expect(toasts.items).toContainEqual({ kind: 'success', text: 'Deleted "Mow the lawn".' });
	});

	it('explains a refused completion without touching the list', async () => {
		const task = buildFamilyBoardTaskWire();
		const { state, toasts } = buildState({
			api: fakeApi({ update: async () => ({ ok: false as const, status: 404, error: 'Task not found' }) })
		});
		await state.toggle(task);
		expect(toasts.items).toContainEqual({ kind: 'error', text: 'Task not found' });
		expect(state.data.tasks).toHaveLength(1);
	});

	it('reports a skipped recurring occurrence as not counted', async () => {
		const task = buildFamilyBoardTaskWire({ recurrenceFrequency: 'weekly' });
		const { state, toasts } = buildState({ api: fakeApi({ update: okUpdate(task) }) });
		await state.advance(task);
		expect(toasts.items[0]?.text).toContain('not counted toward your streak');
	});
});
