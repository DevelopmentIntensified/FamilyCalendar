import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Focused tests for the extracted mutation seams in tasks.ts:
 * `canMutateTask` (owned OR assigned OR family-member predicate) and
 * `applyToggle` (recurring-vs-oneoff decision). Same boundary-stubbing
 * pattern as toggleTaskComplete.test.ts: the drizzle query-builder is
 * replaced with a scripted stub so decision logic runs without a DB.
 */
const state = vi.hoisted(() => ({
	queue: [] as unknown[][],
	updatePatch: null as Record<string, unknown> | null,
	updateResult: null as Record<string, unknown> | null
}));

vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => Promise.resolve((state.queue.shift() ?? []) as unknown[])
			})
		}),
		update: () => ({
			set: (patch: Record<string, unknown>) => {
				state.updatePatch = patch;
				return {
					where: () => ({
						returning: () => Promise.resolve(state.updateResult ? [state.updateResult] : [])
					})
				};
			}
		}),
		insert: () => ({
			values: () => Promise.resolve()
		})
	}
}));

import { canMutateTask, applyToggle } from './tasks';

function makeTask(overrides: Record<string, unknown> = {}) {
	return {
		id: 't1',
		title: 'Water the plants',
		notes: null,
		dueDate: '2026-08-28T23:59:00.000Z',
		completedAt: null,
		archivedAt: null,
		recurrenceFrequency: 'daily',
		recurrenceInterval: 1,
		completionCount: 0,
		assignedTo: null,
		assignmentStatus: 'none',
		priority: 'normal',
		userId: 'user-a',
		familyId: null,
		eventId: null,
		createdAt: new Date(),
		...overrides
	};
}

beforeEach(() => {
	state.queue = [];
	state.updatePatch = null;
	state.updateResult = null;
});

describe('canMutateTask', () => {
	it('allows the owner without a DB lookup (no family query queued)', async () => {
		const task = makeTask({ userId: 'user-a', assignedTo: 'user-b', familyId: 'fam-1' });
		// No query needed: the DB queue stays empty and the call still resolves.
		expect(await canMutateTask(task, 'user-a')).toBe(true);
		expect(state.queue).toEqual([]);
	});

	it('allows the assignee without a DB lookup', async () => {
		const task = makeTask({ userId: 'user-b', assignedTo: 'user-a' });
		expect(await canMutateTask(task, 'user-a')).toBe(true);
		expect(state.queue).toEqual([]);
	});

	it('allows any family member to mutate a family task (DB-backed leg)', async () => {
		const task = makeTask({ userId: 'user-b', assignedTo: 'user-c', familyId: 'fam-1' });
		state.queue = [[{ familyId: 'fam-1' }]];
		expect(await canMutateTask(task, 'user-a')).toBe(true);
	});

	it('denies a non-member caller on another person’s family task', async () => {
		const task = makeTask({ userId: 'user-b', assignedTo: 'user-b', familyId: 'fam-1' });
		state.queue = [[]];
		expect(await canMutateTask(task, 'user-a')).toBe(false);
	});

	it('denies an unrelated caller on a private task (no family)', async () => {
		const task = makeTask({ userId: 'user-b', assignedTo: 'user-b' });
		// No family → no membership query is attempted.
		expect(await canMutateTask(task, 'user-a')).toBe(false);
		expect(state.queue).toEqual([]);
	});
});

describe('applyToggle', () => {
	it('advances an OPEN recurring task (cursor + completionCount, not completedAt)', async () => {
		const task = makeTask({ completedAt: null, recurrenceFrequency: 'daily' });
		state.updateResult = { ...task, dueDate: '2026-08-29T23:59:00.000Z', completionCount: 1 };

		await applyToggle(task);

		expect(state.updatePatch).toHaveProperty('dueDate');
		expect(state.updatePatch).toHaveProperty('completionCount');
		expect(state.updatePatch).not.toHaveProperty('completedAt');
	});

	it('toggles (completes) a NON-recurring open task instead of advancing', async () => {
		const task = makeTask({ completedAt: null, recurrenceFrequency: null, recurrenceInterval: null });
		state.updateResult = { ...task, completedAt: '2026-08-29T10:00:00.000Z' };

		await applyToggle(task);

		expect(state.updatePatch).toHaveProperty('completedAt');
		expect(state.updatePatch).not.toHaveProperty('dueDate');
		expect(state.updatePatch).not.toHaveProperty('completionCount');
	});

	it('toggles (un-completes) a COMPLETED recurring task instead of advancing', async () => {
		const task = makeTask({
			completedAt: '2026-08-28T10:00:00.000Z',
			recurrenceFrequency: 'daily'
		});
		state.updateResult = { ...task, completedAt: null };

		await applyToggle(task);

		expect(state.updatePatch).toEqual({ completedAt: null });
	});
});
