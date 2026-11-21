import { describe, it, expect, vi } from 'vitest';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import type { TasksApi } from './tasks.api';
import type { TaskPageRow, TaskWithTagsWire } from './tasks.contract';
import { TaskQuickAddState } from './tasks.quickadd.state.svelte';
import { buildTaskRow } from './tasks.ui.fixtures';

const NOW = new Date(2026, 8, 15, 12, 0, 0, 0);
const AT = '2026-09-01T10:00:00.000Z';

function wireTask(overrides: Partial<TaskWithTagsWire> = {}): TaskWithTagsWire {
	return {
		id: 'new-1',
		title: 'Buy milk',
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
		eventId: null,
		focusMinutes: null,
		focusStartedAt: null,
		category: null,
		createdAt: AT,
		tags: [],
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

function buildState(options: { api?: TasksApi; familyId?: string | null; onError?: (m: string) => void; onAdded?: (r: TaskPageRow) => void }) {
	const toasts = memoryToasts();
	const state = new TaskQuickAddState({
		api: options.api ?? fakeApi(),
		toasts,
		refresh: vi.fn(async () => {}),
		roster: [{ userId: 'u2', firstName: 'Maya', lastName: 'Rivera' }],
		familyId: options.familyId ?? null,
		zone: 'UTC',
		clock: () => NOW,
		onError: options.onError,
		onAdded: options.onAdded
	});
	return { state, toasts };
}

describe('TaskQuickAddState — one task', () => {
	it('parses the title, posts the body and toasts the parsed title', async () => {
		const create = vi.fn<TasksApi['create']>(async () => ({ ok: true as const, data: { success: true as const, task: wireTask() } }));
		const added: TaskPageRow[] = [];
		const { state, toasts } = buildState({ api: fakeApi({ create }), onAdded: (row) => added.push(row) });
		state.setTitle('Buy milk @maya');
		await state.add();
		expect(create).toHaveBeenCalledOnce();
		const body = create.mock.calls[0]?.[0];
		expect(body).toMatchObject({
			title: 'Buy milk',
			assignedTo: 'u2',
			visibility: 'private',
			familyId: null
		});
		expect(body?.dueDate).toBeNull();
		expect(toasts.items[0]?.text).toBe('Added "Buy milk".');
		expect(state.title).toBe('');
		expect(added).toHaveLength(1);
	});

	it('refuses an unknown @member inline and sends nothing', async () => {
		const create = vi.fn();
		const errors: string[] = [];
		const { state } = buildState({ api: fakeApi({ create }), onError: (m) => errors.push(m) });
		state.setTitle('Buy milk @zoe');
		await state.add();
		expect(create).not.toHaveBeenCalled();
		expect(errors[0]).toContain('Unknown member @zoe');
	});

	it('refuses @family with no family', async () => {
		const errors: string[] = [];
		const { state } = buildState({ onError: (m) => errors.push(m) });
		state.setTitle('Clean the gutters @family');
		await state.add();
		expect(errors[0]).toBe("@family needs a family — you're not in one yet.");
	});

	it('shows the error the api answered', async () => {
		const errors: string[] = [];
		const { state } = buildState({
			api: fakeApi({ create: vi.fn(async () => ({ ok: false as const, status: 400, error: 'Title is required' })) }),
			onError: (m) => errors.push(m)
		});
		state.setTitle('Buy milk');
		await state.add();
		expect(errors).toEqual(['Title is required']);
	});

	it('sends the picker date and a named category', async () => {
		const create = vi.fn<TasksApi['create']>(async () => ({ ok: true as const, data: { success: true as const, task: wireTask() } }));
		const { state } = buildState({ api: fakeApi({ create }) });
		state.setTitle('Buy milk');
		state.setDueDate('2026-09-20');
		state.setCategory('Groceries');
		await state.add();
		expect(create.mock.calls[0]?.[0]).toMatchObject({
			dueDate: '2026-09-20T23:59:00',
			category: 'Groceries'
		});
	});
});

describe('TaskQuickAddState — paste a list', () => {
	const twoLines = 'Buy milk\nWalk the dog';

	it('arms on the first press and creates on the second', async () => {
		const create = vi
			.fn<TasksApi['create']>()
			.mockImplementation(async (body) => ({
				ok: true as const,
				data: { success: true as const, task: wireTask({ id: body.title, title: body.title }) }
			}));
		const { state, toasts } = buildState({ api: fakeApi({ create }) });
		state.setTitle(twoLines);
		expect(state.isBulk).toBe(true);
		await state.add();
		expect(state.bulkConfirming).toBe(true);
		expect(create).not.toHaveBeenCalled();
		await state.add();
		expect(create).toHaveBeenCalledTimes(2);
		expect(toasts.items[0]?.text).toBe('Added 2 tasks.');
		expect(state.title).toBe('');
		expect(state.bulkConfirming).toBe(false);
	});

	it('keeps the failed lines in the box and names them', async () => {
		const create = vi
			.fn<TasksApi['create']>()
			.mockResolvedValueOnce({
				ok: true as const,
				data: { success: true as const, task: wireTask({ id: 'a', title: 'Buy milk' }) }
			})
			.mockResolvedValueOnce({ ok: false as const, status: 500, error: 'Failed' });
		const { state, toasts } = buildState({ api: fakeApi({ create }) });
		state.setTitle(twoLines);
		await state.add();
		await state.add();
		expect(toasts.items[0]?.text).toBe('Added 1 of 2 — failed: Walk the dog.');
		expect(state.title).toBe('Walk the dog');
	});

	it('creates one row and drops its line', async () => {
		const create = vi.fn<TasksApi['create']>(async () => ({ ok: true as const, data: { success: true as const, task: wireTask() } }));
		const { state, toasts } = buildState({ api: fakeApi({ create }) });
		state.setTitle(twoLines);
		await state.createRow('Buy milk', 'Buy milk');
		expect(create).toHaveBeenCalledOnce();
		expect(toasts.items[0]?.text).toBe('Added "Buy milk".');
		expect(state.title).toBe('Walk the dog');
	});

	it('does not create while an unknown member blocks the batch', async () => {
		const create = vi.fn();
		const { state } = buildState({ api: fakeApi({ create }) });
		state.setTitle('Buy milk\nWalk the dog @zoe');
		await state.add();
		await state.add();
		expect(create).not.toHaveBeenCalled();
	});
});

describe('TaskQuickAddState — smart tasks', () => {
	it('posts the template cadence with a due date at the end of today', async () => {
		const create = vi.fn<TasksApi['create']>(async () => ({ ok: true as const, data: { success: true as const, task: wireTask() } }));
		const { state, toasts } = buildState({ api: fakeApi({ create }) });
		await state.addSmartTask({
			id: 'car-oil',
			name: 'Change the oil',
			category: 'car',
			recurrenceFrequency: 'yearly',
			recurrenceInterval: 1
		});
		const body = create.mock.calls[0]?.[0];
		expect(body).toMatchObject({ title: 'Change the oil', recurrenceFrequency: 'yearly' });
		expect(new Date(String(body?.dueDate)).getHours()).toBe(23);
		expect(toasts.items[0]?.text).toBe('Added "Change the oil" — every year.');
	});
});
