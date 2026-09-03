import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * One Family Member task-mutation seam: every task mutation goes through
 * `canMutateTask` (owner OR assignee OR family member), whose only DB-backed
 * leg is `isFamilyMember`. Same boundary-stubbing pattern as
 * toggleTaskComplete.test.ts: the drizzle query-builder is scripted so the
 * permission decision logic runs without a live database.
 */
const state = vi.hoisted(() => ({
	queue: [] as unknown[][],
	updatePatch: null as Record<string, unknown> | null,
	updateResult: null as Record<string, unknown> | null,
	insertValues: null as unknown
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
			values: (values: unknown) => {
				state.insertValues = values;
				return Promise.resolve();
			}
		})
	}
}));

import { toggleTaskComplete, toggleTaskCompleteFamily, isFamilyMember } from './tasks';

function makeFamilyTask(overrides: Record<string, unknown> = {}) {
	return {
		id: 't1',
		title: 'Water the plants',
		notes: null,
		dueDate: '2026-08-28T23:59:00.000Z',
		completedAt: null,
		archivedAt: null,
		recurrenceFrequency: null,
		recurrenceInterval: null,
		completionCount: 0,
		assignedTo: null,
		assignmentStatus: 'none',
		priority: 'normal',
		userId: 'user-b',
		familyId: 'fam-1',
		eventId: null,
		createdAt: new Date(),
		...overrides
	};
}

beforeEach(() => {
	state.queue = [];
	state.updatePatch = null;
	state.updateResult = null;
	state.insertValues = null;
});

describe('isFamilyMember (the single membership seam)', () => {
	it('returns true when a membership row exists (role never consulted)', async () => {
		state.queue = [[{ familyId: 'fam-1' }]];
		expect(await isFamilyMember('user-a', 'fam-1')).toBe(true);
	});

	it('returns false when no membership row exists', async () => {
		state.queue = [[]];
		expect(await isFamilyMember('user-x', 'fam-1')).toBe(false);
	});
});

describe('toggleTaskComplete through canMutateTask', () => {
	it('allows a family member (not owner/assignee) to toggle a family task', async () => {
		const task = makeFamilyTask();
		state.queue = [[task], [{ familyId: 'fam-1' }]];
		state.updateResult = { ...task, completedAt: '2026-08-29T10:00:00.000Z' };

		const result = await toggleTaskComplete('t1', 'user-a');

		expect(result).toBeDefined();
		expect(state.updatePatch).toEqual({ completedAt: expect.any(String) });
		expect(state.insertValues).toMatchObject({ taskId: 't1' });
	});

	it('denies a non-member on someone else’s family task (no write, no history)', async () => {
		const task = makeFamilyTask();
		state.queue = [[task], []];

		expect(await toggleTaskComplete('t1', 'user-x')).toBeUndefined();
		expect(state.updatePatch).toBeNull();
		expect(state.insertValues).toBeNull();
	});

	it('denies an unrelated caller on a private task', async () => {
		const task = makeFamilyTask({ userId: 'user-b', assignedTo: 'user-b', familyId: null });
		state.queue = [[task]];

		expect(await toggleTaskComplete('t1', 'user-x')).toBeUndefined();
		expect(state.updatePatch).toBeNull();
	});
});

describe('toggleTaskCompleteFamily through canMutateTask', () => {
	it('allows a family member to toggle', async () => {
		const task = makeFamilyTask();
		state.queue = [[task], [{ familyId: 'fam-1' }]];
		state.updateResult = { ...task, completedAt: '2026-08-29T10:00:00.000Z' };

		const result = await toggleTaskCompleteFamily('t1', 'fam-1', 'user-a');

		expect(result).toBeDefined();
		expect(state.insertValues).toMatchObject({ taskId: 't1' });
	});

	it('denies a non-member even when the task is in the family', async () => {
		const task = makeFamilyTask();
		state.queue = [[task], []];

		expect(await toggleTaskCompleteFamily('t1', 'fam-1', 'user-x')).toBeUndefined();
		expect(state.updatePatch).toBeNull();
		expect(state.insertValues).toBeNull();
	});

	it('returns undefined when the task is not in the given family', async () => {
		state.queue = [[]];

		expect(await toggleTaskCompleteFamily('t1', 'fam-other', 'user-a')).toBeUndefined();
		expect(state.updatePatch).toBeNull();
	});
});
