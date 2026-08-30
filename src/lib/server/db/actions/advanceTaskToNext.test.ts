import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * DB actions are tested at the boundary: the drizzle query-builder is
 * replaced with a scripted stub so decision logic (eligibility,
 * permissions, cursor advance) is verified without a live database.
 * Each `select...where` call shifts the next batch out of `queue`.
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
		})
	}
}));

import { advanceTaskToNext, advanceCursor } from './tasks';

const nowIso = () => new Date().toISOString();

function recurringTask(overrides: Record<string, unknown> = {}) {
	return {
		id: 't1',
		title: 'Take out trash',
		notes: null,
		dueDate: '2026-08-28T23:59:00.000Z',
		completedAt: '2026-08-27T10:00:00.000Z',
		archivedAt: null,
		recurrenceFrequency: 'weekly',
		recurrenceInterval: 1,
		completionCount: 0,
		assignedTo: 'user-a',
		assignmentStatus: 'accepted',
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

describe('advanceTaskToNext', () => {
	it('returns null (and updates nothing) when the task does not exist', async () => {
		state.queue = [[]];
		expect(await advanceTaskToNext('missing', 'user-a')).toBeNull();
		expect(state.updatePatch).toBeNull();
	});

	it('returns null for non-recurring tasks — skip is only for recurring ones', async () => {
		state.queue = [[recurringTask({ recurrenceFrequency: null, recurrenceInterval: null })]];
		expect(await advanceTaskToNext('t1', 'user-a')).toBeNull();
		expect(state.updatePatch).toBeNull();
	});

	it('creator advances their own recurring task and clears completedAt when set', async () => {
		const task = recurringTask();
		state.queue = [[task]];
		const expectedDue = advanceCursor(task.dueDate as string, 'weekly', 1, nowIso());
		state.updateResult = { ...task, dueDate: expectedDue, completedAt: null };

		const result = await advanceTaskToNext('t1', 'user-a');
		expect(result).not.toBeNull();
		expect(result!.dueDate).toBe(expectedDue);
		expect(result!.completedAt).toBeNull();
		expect(state.updatePatch).toEqual({ dueDate: expectedDue, completedAt: null });
	});

	it('the assignee (not the creator) may also advance', async () => {
		const task = recurringTask({ userId: 'user-b' });
		state.queue = [[task]];
		const expectedDue = advanceCursor(task.dueDate as string, 'weekly', 1, nowIso());
		state.updateResult = { ...task, dueDate: expectedDue, completedAt: null };

		const result = await advanceTaskToNext('t1', 'user-a');
		expect(result?.dueDate).toBe(expectedDue);
	});

	it('any family member may advance a family task', async () => {
		const task = recurringTask({ userId: 'user-b', assignedTo: 'user-b', familyId: 'fam-1' });
		// select #1 = the task, select #2 = family-membership row
		state.queue = [[task], [{ familyId: 'fam-1' }]];
		const expectedDue = advanceCursor(task.dueDate as string, 'weekly', 1, nowIso());
		state.updateResult = { ...task, dueDate: expectedDue, completedAt: null };

		const result = await advanceTaskToNext('t1', 'user-a');
		expect(result?.dueDate).toBe(expectedDue);
	});

	it('a non-member caller cannot advance someone else’s family task', async () => {
		const task = recurringTask({ userId: 'user-b', assignedTo: 'user-b', familyId: 'fam-1' });
		state.queue = [[task], []];
		expect(await advanceTaskToNext('t1', 'user-a')).toBeNull();
		expect(state.updatePatch).toBeNull();
	});

	it('an unrelated caller cannot advance a private task owned by someone else', async () => {
		const task = recurringTask({ userId: 'user-b', assignedTo: 'user-b' });
		state.queue = [[task]];
		expect(await advanceTaskToNext('t1', 'user-a')).toBeNull();
		expect(state.updatePatch).toBeNull();
	});
});
