import { describe, it, expect, vi } from 'vitest';
import type { TasksApi } from './tasks.api';
import type { TaskWire } from './tasks.contract';
import { EventTaskChecklistState } from './tasks.checklist.state.svelte';

const AT = '2026-09-01T10:00:00.000Z';

function wireTask(overrides: Partial<TaskWire> = {}): TaskWire {
	return {
		id: 't1',
		title: 'Pack lunches',
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
		visibility: 'private',
		userId: 'u1',
		familyId: null,
		eventId: 'e1',
		focusMinutes: null,
		focusStartedAt: null,
		category: null,
		createdAt: AT,
		...overrides
	};
}

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

describe('EventTaskChecklistState', () => {
	it('reads the Event rows once per id', async () => {
		const listForEvent = vi.fn(async () => ({ ok: true as const, data: { tasks: [wireTask()] } }));
		const state = new EventTaskChecklistState({ api: fakeApi({ listForEvent }), eventId: 'e1' });
		await state.load('e1');
		await state.load('e1');
		expect(listForEvent).toHaveBeenCalledOnce();
		expect(state.rows).toHaveLength(1);
		expect(state.attachedCount).toBe(1);
	});

	it('queues titles in create mode and reports the list', async () => {
		const reported: string[][] = [];
		const state = new EventTaskChecklistState({
			api: fakeApi(),
			eventId: null,
			onPendingTitlesChange: (titles) => reported.push(titles)
		});
		state.draftTitle = 'Pack lunches';
		await state.add();
		expect(state.pending).toEqual(['Pack lunches']);
		expect(reported).toEqual([['Pack lunches']]);
		expect(state.draftTitle).toBe('');
	});

	it('POSTs a new row on an existing Event', async () => {
		const create = vi.fn(async () => ({
			ok: true as const,
			data: { success: true as const, task: wireTask({ id: 't2', title: 'Feed the dog' }) }
		}));
		const state = new EventTaskChecklistState({
			api: fakeApi({ listForEvent: vi.fn(async () => ({ ok: true as const, data: { tasks: [] } })), create }),
			eventId: 'e1'
		});
		await state.load('e1');
		state.draftTitle = 'Feed the dog';
		await state.add();
		expect(create.mock.calls[0]?.[0]).toEqual({ title: 'Feed the dog', eventId: 'e1' });
		expect(state.rows.map((row) => row.title)).toEqual(['Feed the dog']);
	});

	it('shows the api refusal inline', async () => {
		const state = new EventTaskChecklistState({
			api: fakeApi({
				listForEvent: vi.fn(async () => ({ ok: true as const, data: { tasks: [] } })),
				create: vi.fn(async () => ({ ok: false as const, status: 500, error: 'Failed to create task' }))
			}),
			eventId: 'e1'
		});
		await state.load('e1');
		state.draftTitle = 'Feed the dog';
		await state.add();
		expect(state.error).toBe('Failed to create task');
		expect(state.rows).toEqual([]);
	});

	it('toggles a row in place and removes one', async () => {
		const update = vi.fn(async () => ({
			ok: true as const,
			data: { success: true as const, task: wireTask({ completedAt: AT }) }
		}));
		const remove = vi.fn(async () => ({ ok: true as const, data: { success: true as const } }));
		const state = new EventTaskChecklistState({
			api: fakeApi({
				listForEvent: vi.fn(async () => ({ ok: true as const, data: { tasks: [wireTask()] } })),
				update,
				remove
			}),
			eventId: 'e1'
		});
		await state.load('e1');
		await state.toggle('t1');
		expect(state.rows[0]?.completedAt).toBe(AT);
		await state.remove('t1');
		expect(state.rows).toEqual([]);
	});
});
