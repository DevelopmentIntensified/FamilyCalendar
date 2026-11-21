import { describe, it, expect, vi } from 'vitest';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte';
import type { Scheduler } from '$lib/kernel/time/scheduler';
import type { TasksApi } from './tasks.api';
import { TasksPageState } from './tasks.page.state.svelte';
import type { TaskEditDraft } from './tasks.editor.rules';
import type { TaskPageRow, TaskWithTagsWire } from './tasks.contract';
import { buildTaskCategory, buildTaskRow, buildTaskSections } from './tasks.ui.fixtures';

const NOW = new Date(2026, 8, 15, 12, 0, 0, 0);
const AT = '2026-09-01T10:00:00.000Z';

/** The `PUT` answer's row: the wire row the state reads back off a mutation. */
function wireTask(overrides: Partial<TaskWithTagsWire> = {}): TaskWithTagsWire {
	return {
		id: 't1',
		title: 'Mow the yard',
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

function manualScheduler() {
	const queue: { fn: () => void; ms: number; cancelled: boolean }[] = [];
	const schedule: Scheduler = (fn, ms) => {
		const entry = { fn, ms, cancelled: false };
		queue.push(entry);
		return () => {
			entry.cancelled = true;
		};
	};
	return { queue, schedule };
}

function memoryStorage() {
	const data = new Map<string, string>();
	return {
		data,
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => void data.set(key, value),
		removeItem: (key: string) => void data.delete(key)
	};
}

type Row = Partial<TaskPageRow> & { id: string };

function buildState(options: {
	rows?: readonly Row[];
	api?: TasksApi;
	memberRows?: readonly TaskPageRow[];
	categories?: { id: string; name: string }[];
	storage?: ReturnType<typeof memoryStorage>;
	schedule?: Scheduler;
	refresh?: () => Promise<void>;
}) {
	const toasts = memoryToasts();
	const refresh = options.refresh ?? vi.fn(async () => {});
	const state = new TasksPageState({
		api: options.api ?? fakeApi(),
		toasts,
		refresh,
		sections: {
			...buildTaskSections({
				myTasks: (options.rows ?? [{ id: 't1' }]).map(
					(row) => buildTaskRow(row)
				),
				pendingAssignments: options.memberRows ?? [],
				requestedByMe: options.memberRows ?? []
			})
		},
		categories: options.categories ?? [],
		roster: [],
		currentUserId: 'u1',
		clock: () => NOW,
		schedule: options.schedule,
		storage: options.storage
	});
	return { state, toasts, refresh };
}

describe('TasksPageState — completion', () => {
	it('flips the row at once, then re-reads and toasts', async () => {
		const gate = Promise.withResolvers<void>();
		const api = fakeApi({
			update: vi.fn(async () => {
				await gate.promise;
				return {
					ok: true as const,
					data: {
						success: true as const,
						task: {
							...buildTaskRow({ id: 't1' }),
							archivedAt: null,
							dueDate: null,
							completedAt: AT,
							focusStartedAt: null,
							createdAt: AT
						}
					}
				};
			})
		});
		const { state, toasts, refresh } = buildState({ api, rows: [{ id: 't1' }] });
		expect(state.openTasks).toHaveLength(1);
		const done = state.toggle('t1');
		expect(state.openTasks).toHaveLength(0);
		expect(state.completedTasks).toHaveLength(1);
		gate.resolve();
		await done;
		expect(state.openTasks).toHaveLength(1);
		expect(refresh).toHaveBeenCalledOnce();
		expect(toasts.items).toEqual([{ kind: 'success', text: '"Wash the car" marked done.' }]);
	});

	it('rolls the flip back and explains when the server refuses', async () => {
		const api = fakeApi({
			update: vi.fn(async () => ({ ok: false as const, status: 403, error: 'Not yours' }))
		});
		const { state, toasts, refresh } = buildState({ api, rows: [{ id: 't1' }] });
		await state.toggle('t1');
		expect(state.openTasks).toHaveLength(1);
		expect(state.error).toBe('Not yours');
		expect(toasts.items).toEqual([]);
		expect(refresh).not.toHaveBeenCalled();
	});

	it('keeps the optimistic row when the network never answered', async () => {
		const api = fakeApi({
			update: vi.fn(async () => ({ ok: false as const, status: 0, error: 'Network problem. Try again.' }))
		});
		const { state } = buildState({ api, rows: [{ id: 't1' }] });
		await state.toggle('t1');
		expect(state.openTasks).toHaveLength(0);
		expect(state.error).toBe('');
	});

	it('celebrates a recurring completion and offers an Undo that rewinds', async () => {
		const updated = {
			...buildTaskRow({
				id: 't1',
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1,
				dueDate: '2026-09-19T23:59:00.000Z'
			}),
			archivedAt: null,
			completedAt: null,
			focusStartedAt: null,
			createdAt: AT
		};
		const update = vi
			.fn<TasksApi['update']>()
			.mockResolvedValueOnce({ ok: true, data: { success: true, task: updated } })
			.mockResolvedValueOnce({ ok: true, data: { success: true, task: updated } });
		const { state, toasts, refresh } = buildState({
			api: fakeApi({ update }),
			rows: [{ id: 't1', recurrenceFrequency: 'weekly', dueDate: '2026-09-15T23:59:00.000Z' }]
		});
		await state.toggle('t1');
		const completeToast = toasts.items[0];
		expect(completeToast?.kind).toBe('success');
		expect(completeToast?.text).toContain('counts toward your streak');
		expect(completeToast?.action?.label).toBe('Undo');
		completeToast?.action?.run();
		await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
		expect(update.mock.calls[1]?.[1]).toEqual({
			undoComplete: true,
			previousDueDate: '2026-09-15T23:59:00.000Z'
		});
		expect(toasts.items.at(-1)).toEqual({
			kind: 'success',
			text: '↩️ Undone — back to the previous occurrence.'
		});
	});
});

describe('TasksPageState — skip', () => {
	it('toasts the skip copy, never counted', async () => {
		const updated = {
			...buildTaskRow({ id: 't1', recurrenceFrequency: 'weekly' }),
			archivedAt: null,
			focusStartedAt: null,
			createdAt: AT
		};
		const { state, toasts } = buildState({
			api: fakeApi({ update: vi.fn(async () => ({ ok: true as const, data: { success: true as const, task: updated } })) }),
			rows: [{ id: 't1', recurrenceFrequency: 'weekly' }]
		});
		await state.skip('t1');
		expect(toasts.items[0]?.text).toMatch(/^Skipped this occurrence — not counted toward your streak\./);
	});
});

describe('TasksPageState — focus', () => {
	it('says the server cannot focus yet on a 404', async () => {
		const { state } = buildState({
			api: fakeApi({ focusCommand: vi.fn(async () => ({ ok: false as const, status: 404, error: 'Not found' })) }),
			rows: [{ id: 't1' }]
		});
		const task = state.openTasks[0];
		await state.toggleFocus(task);
		expect(state.error).toBe("This server can't start focus yet.");
	});

	it('flips the row, toasts, and drops the override after the settle', async () => {
		const { queue, schedule } = manualScheduler();
		const focusCommand = vi.fn(async () => ({ ok: true as const, data: undefined }));
		const { state, toasts, refresh } = buildState({
			api: fakeApi({ focusCommand }),
			rows: [{ id: 't1' }],
			schedule
		});
		const task = state.openTasks[0];
		await state.toggleFocus(task);
		expect(focusCommand).toHaveBeenCalledWith('start', 't1');
		expect(toasts.items[0]?.text).toBe('Asked TaskFocus to start focus.');
		expect(state.allRows[0]?.focusStartedAt).toBe(NOW.toISOString());
		expect(queue[0]?.ms).toBe(4_000);
		queue[0]?.fn();
		await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
		await vi.waitFor(() => expect(state.allRows[0]?.focusStartedAt).toBeNull());
	});

	it('a second tap sends stop with no task id', async () => {
		const focusCommand = vi.fn(async () => ({ ok: true as const, data: undefined }));
		const { state, toasts } = buildState({
			api: fakeApi({ focusCommand }),
			rows: [{ id: 't1', focusStartedAt: NOW.toISOString() }]
		});
		await state.toggleFocus(state.openTasks[0]);
		expect(focusCommand).toHaveBeenCalledWith('stop', undefined);
		expect(toasts.items[0]?.text).toBe('Asked TaskFocus to stop focus.');
	});
});

describe('TasksPageState — assignments', () => {
	it('accepts with the legacy copy and re-reads', async () => {
		const { state, toasts, refresh } = buildState({
			api: fakeApi({ update: vi.fn(async () => ({ ok: true as const, data: { success: true as const, task: wireTask() } })) }),
			rows: [{ id: 't1' }]
		});
		await state.respond({ id: 't9', title: 'Mow' }, true);
		expect(toasts.items[0]?.text).toBe('Accepted "Mow" — it\'s on your list.');
		expect(refresh).toHaveBeenCalledOnce();
	});
});

describe('TasksPageState — delete and clear', () => {
	it('toasts the deleted title', async () => {
		const { state, toasts } = buildState({
			api: fakeApi({ remove: vi.fn(async () => ({ ok: true as const, data: { success: true as const } })) }),
			rows: [{ id: 't1' }]
		});
		await state.remove('t1');
		expect(toasts.items[0]?.text).toBe('Deleted "Wash the car".');
	});

	it('sends exactly one DELETE while the first is in flight', async () => {
		const gate = Promise.withResolvers<void>();
		const clearCompleted = vi.fn(async () => {
			await gate.promise;
			return { ok: true as const, data: { success: true as const } };
		});
		const { state, toasts } = buildState({ api: fakeApi({ clearCompleted }) });
		const first = state.clearCompleted();
		const second = state.clearCompleted();
		expect(state.clearBusy).toBe(true);
		expect(clearCompleted).toHaveBeenCalledTimes(1);
		gate.resolve();
		await Promise.all([first, second]);
		expect(state.clearBusy).toBe(false);
		expect(toasts.items[0]?.text).toBe('Completed tasks cleared — fresh start.');
	});
});

describe('TasksPageState — categories', () => {
	it('renames optimistically and rolls back with a toast', async () => {
		const { state, toasts } = buildState({
			api: fakeApi({
				renameCategory: vi.fn(async () => ({ ok: false as const, status: 409, error: 'A category with that name already exists' }))
			}),
			categories: [buildTaskCategory('c1', 'School')]
		});
		await state.renameCategory('c1', 'Work');
		expect(state.categories).toEqual([{ id: 'c1', name: 'School' }]);
		expect(state.error).toBe('A category with that name already exists');
		expect(toasts.items[0]?.text).toBe(
			'Couldn\'t rename "School": A category with that name already exists'
		);
	});

	it('drops a deleted category at once and keeps it gone on a 404', async () => {
		const { state } = buildState({
			api: fakeApi({ removeCategory: vi.fn(async () => ({ ok: false as const, status: 404, error: 'not found' })) }),
			categories: [buildTaskCategory('c1', 'School'), buildTaskCategory('c2', 'Home')]
		});
		await state.removeCategory('c1');
		expect(state.categories).toEqual([{ id: 'c2', name: 'Home' }]);
	});
});

describe('TasksPageState — editor', () => {
	const draft: TaskEditDraft = {
		title: 'Mow the yard',
		notes: '',
		tags: '',
		due: '',
		freq: '',
		interval: 1,
		assignedTo: '',
		priority: 'normal',
		visibility: 'private',
		category: ''
	};

	it('closes on success and names the saved title', async () => {
		const { state, toasts } = buildState({
			api: fakeApi({
				update: vi.fn(async () => ({
					ok: true as const,
					data: { success: true as const, task: wireTask({ title: 'Mow the yard' }) }
				}))
			}),
			rows: [{ id: 't1' }]
		});
		state.openEditor(state.openTasks[0]);
		await state.saveEdit(draft);
		expect(state.editing).toBeNull();
		expect(toasts.items[0]?.text).toBe('Saved "Mow the yard".');
	});

	it('keeps the sheet open and explains a refusal', async () => {
		const { state, toasts } = buildState({
			api: fakeApi({
				update: vi.fn(async () => ({ ok: false as const, status: 403, error: 'Not allowed' }))
			}),
			rows: [{ id: 't1' }]
		});
		state.openEditor(state.openTasks[0]);
		await state.saveEdit(draft);
		expect(state.editing).not.toBeNull();
		expect(state.error).toBe('Not allowed');
		expect(toasts.items[0]?.text).toBe('Couldn\'t save "Mow the yard" — Not allowed');
	});
});

describe('TasksPageState — filters and preferences', () => {
	it('applies chip, tag, search and owner view', () => {
		const { state } = buildState({
			rows: [
				{ id: 'a', title: 'Wash the car', tags: ['outside'] },
				{ id: 'b', title: 'Mow the lawn', tags: ['outside'], assignedTo: 'u1', assignmentStatus: 'accepted' },
				{ id: 'c', title: 'Empty the bin', tags: ['inside'] }
			]
		});
		state.setChip('private');
		expect(state.matched.map((row) => row.id)).toEqual(['a', 'b', 'c']);
		state.setTagFilter('out');
		expect(state.matched.map((row) => row.id)).toEqual(['a', 'b']);
		state.setSearchQuery('mow');
		expect(state.matched.map((row) => row.id)).toEqual(['b']);
		state.setView('mine');
		expect(state.matched.map((row) => row.id)).toEqual(['b']);
	});

	it('persists the sort key and the tag filter', () => {
		const storage = memoryStorage();
		const first = buildState({ rows: [{ id: 'a' }], storage });
		first.state.setSortBy('title');
		first.state.setTagFilter('gro');
		const second = buildState({ rows: [{ id: 'a' }], storage });
		expect(second.state.sortBy).toBe('title');
		expect(second.state.tagFilter).toBe('gro');
	});
});
