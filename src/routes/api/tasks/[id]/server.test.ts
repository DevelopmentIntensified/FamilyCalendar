import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Assignment authorization on PUT /api/tasks/[id]: the task OWNER keeps
 * full control of the assignment patch, but a non-owner family member
 * may only respond to their OWN assignment (accept / decline). The
 * drizzle query-builder is scripted (same pattern as taskMutation.test.ts)
 * and the DB-hitting action seams are injected as spies.
 */
/** A stubbed DB row: plain JSON-ish values only (house stub style). */
type Row = Record<string, string | null>;

interface StubState {
	queue: Row[][];
	deletedWheres: unknown[];
	updatedWheres: unknown[];
}

const state = vi.hoisted(
	(): StubState => ({ queue: [], deletedWheres: [], updatedWheres: [] })
);

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => Promise.resolve(state.queue.shift() ?? [])
			})
		}),
		delete: () => ({
			where: (where: unknown) => {
				state.deletedWheres.push(where);
				return Promise.resolve();
			}
		}),
		update: () => ({
			set: () => ({
				where: (where: unknown) => {
					state.updatedWheres.push(where);
					return Promise.resolve();
				}
			})
		})
	}
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- decision helpers stay real (importActual); DB seams become spies.
vi.mock('$lib/server/db/actions/tasks', async (importOriginal) => ({
	...(await importOriginal<object>()),
	updateTask: vi.fn(),
	updateTaskInFamily: vi.fn(),
	canMutateTask: vi.fn(),
	toggleTaskComplete: vi.fn(),
	advanceTaskToNext: vi.fn(),
	undoRecurringCompletion: vi.fn(),
	isValidAssignee: vi.fn(),
	isFamilyMember: vi.fn()
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- spy seam; the real module writes to the DB.
vi.mock('$lib/server/db/actions/notifications', () => ({
	createNotification: vi.fn()
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted zone; the real module reads user settings from the DB.
vi.mock('$lib/server/utils/userTimezone', () => ({
	getUserZone: vi.fn(async () => 'UTC'),
	zonedNow: vi.fn()
}));

import { PUT, DELETE } from './+server';
import {
	updateTask,
	updateTaskInFamily,
	canMutateTask,
	isValidAssignee
} from '$lib/server/db/actions/tasks';
import { createNotification } from '$lib/server/db/actions/notifications';

/** Stubbed task row — only the fields the PUT handler / seam spies read. */
type TaskStub = {
	id: string;
	title: string;
	userId: string;
	familyId: string;
	assignedTo: string | null;
	assignmentStatus: string;
};

/** Family task owned by user-owner, pending-assigned to user-assignee. */
function taskRow(over: Partial<TaskStub> = {}): TaskStub {
	return {
		id: 't1',
		title: 'Dishes',
		userId: 'user-owner',
		familyId: 'fam-1',
		assignedTo: 'user-assignee',
		assignmentStatus: 'pending',
		...over
	};
}

function event(userId: string, body: Record<string, string | null>) {
	// SAFETY: test double — the handler only reads locals.user, url.pathname, and request.json().
	return {
		locals: { user: { id: userId } },
		url: new URL('http://localhost/api/tasks/t1'),
		request: {
			url: 'http://localhost/api/tasks/t1',
			json: async () => body
		}
	} as never;
}

const mockedUpdateTask = vi.mocked(updateTask);
const mockedUpdateInFamily = vi.mocked(updateTaskInFamily);
const mockedCanMutate = vi.mocked(canMutateTask);
const mockedIsValidAssignee = vi.mocked(isValidAssignee);

beforeEach(() => {
	state.queue = [];
	state.deletedWheres = [];
	state.updatedWheres = [];
	vi.clearAllMocks();
	mockedUpdateTask.mockResolvedValue(undefined);
	mockedCanMutate.mockResolvedValue(true);
	mockedIsValidAssignee.mockResolvedValue(true);
});

describe('PUT /api/tasks/[id] — assignment authorization', () => {
	it('lets the current assignee accept their own pending assignment', async () => {
		state.queue.push([taskRow()]); // non-owner fallback loads the task
		state.queue.push([{ firstName: 'Ali' }]); // getActorName for the notification
		// SAFETY: stub return satisfies the seam spy's nominal TaskWithTags parameter in tests.
		mockedUpdateInFamily.mockResolvedValue(taskRow({ assignmentStatus: 'accepted' }) as never);

		const res = await PUT(event('user-assignee', { assignmentStatus: 'accepted' }));

		expect(res.status).toBe(200);
		expect(mockedUpdateInFamily).toHaveBeenCalledWith('t1', 'fam-1', {
			assignmentStatus: 'accepted',
			tags: undefined
		});
		expect(createNotification).toHaveBeenCalled();
	});

	it('lets the current assignee decline (release back to the pool)', async () => {
		state.queue.push([taskRow()]);
		// SAFETY: stub return satisfies the seam spy's nominal TaskWithTags parameter in tests.
		mockedUpdateInFamily.mockResolvedValue(taskRow({ assignmentStatus: 'none' }) as never);

		const res = await PUT(event('user-assignee', { assignmentStatus: 'declined' }));

		expect(res.status).toBe(200);
		expect(mockedUpdateInFamily).toHaveBeenCalledWith('t1', 'fam-1', {
			assignedTo: null,
			assignmentStatus: 'none',
			tags: undefined
		});
	});

	it('403s a family member declining someone else’s assignment', async () => {
		state.queue.push([taskRow()]);

		const res = await PUT(event('user-bystander', { assignmentStatus: 'declined' }));

		expect(res.status).toBe(403);
		expect(mockedUpdateInFamily).not.toHaveBeenCalled();
	});

	it('403s a family member reassigning', async () => {
		state.queue.push([taskRow()]); // reassign-target familyId check
		state.queue.push([taskRow()]); // non-owner fallback loads the task

		const res = await PUT(event('user-bystander', { assignedTo: 'user-assignee' }));

		expect(res.status).toBe(403);
		expect(mockedUpdateInFamily).not.toHaveBeenCalled();
	});

	it('lets the owner reassign to a family member', async () => {
		state.queue.push([taskRow()]); // reassign-target familyId check
		// SAFETY: stub return satisfies the seam spy's nominal TaskWithTags parameter in tests.
		mockedUpdateTask.mockResolvedValue(taskRow({ assignedTo: 'user-b' }) as never);

		const res = await PUT(event('user-owner', { assignedTo: 'user-b' }));

		expect(res.status).toBe(200);
		expect(mockedUpdateTask).toHaveBeenCalledWith(
			't1',
			'user-owner',
			expect.objectContaining({ assignedTo: 'user-b', assignmentStatus: 'pending' })
		);
	});

	it('400s the owner reassigning to a non-family user', async () => {
		state.queue.push([taskRow()]); // reassign-target familyId check
		mockedIsValidAssignee.mockResolvedValue(false);

		const res = await PUT(event('user-owner', { assignedTo: 'user-stranger' }));

		expect(res.status).toBe(400);
		expect(mockedUpdateTask).not.toHaveBeenCalled();
	});
});

describe('PUT /api/tasks/[id] — visibility patch (issue 019)', () => {
	it('lets the owner change visibility', async () => {
		state.queue.push([taskRow()]); // owner pre-check loads the task
		// SAFETY: stub return satisfies the seam spy's nominal TaskWithTags parameter in tests.
		mockedUpdateTask.mockResolvedValue(taskRow({ userId: 'user-owner' }) as never);

		const res = await PUT(event('user-owner', { visibility: 'private' }));

		expect(res.status).toBe(200);
		expect(mockedUpdateTask).toHaveBeenCalledWith(
			't1',
			'user-owner',
			expect.objectContaining({ visibility: 'private' })
		);
	});

	it('403s a non-owner (assignee) trying to change visibility', async () => {
		state.queue.push([taskRow()]); // owner pre-check loads the task

		const res = await PUT(event('user-assignee', { visibility: 'private' }));

		expect(res.status).toBe(403);
		expect(mockedUpdateTask).not.toHaveBeenCalled();
	});

	it('400s on an unsupported visibility value', async () => {
		const res = await PUT(event('user-owner', { visibility: 'secret' }));

		expect(res.status).toBe(400);
		expect(mockedUpdateTask).not.toHaveBeenCalled();
		expect(state.queue).toEqual([]);
	});
});

/**
 * DELETE /api/tasks/[id] — permission-aware deletion (Bearer-token todo
 * apps like Todoos sync deletions over this endpoint). Previously the
 * handler always returned `success` even when the owner-only delete seam
 * matched no row, so deleting a family task from the API silently
 * no-opped and the task re-downloaded on the next GET. Now the handler
 * maps `deleteTask === false` (missing OR not authorized under the same
 * issue-019 canMutateTask rules PUT uses) to 404.
 */
describe('DELETE /api/tasks/[id] — deletion sync (canMutateTask rules)', () => {
	function deleteEvent(userId: string, taskId: string) {
		// SAFETY: test double — the DELETE handler only reads locals.user and url.
		return {
			locals: { user: { id: userId } },
			url: new URL(`http://localhost/api/tasks/${taskId}`),
			request: { url: `http://localhost/api/tasks/${taskId}` }
		} as never;
	}

	it('deletes when canMutateTask authorizes (family member scenario)', async () => {
		// deleteTask loads the full row; then the REAL canMutateTask → its
		// internal isFamilyMember query needs a familyMembers hit.
		state.queue.push([taskRow()], [{ familyId: 'fam-1' }]);

		const res = await DELETE(deleteEvent('user-member', 't1'));

		expect(res.status).toBe(200);
		expect(state.deletedWheres).toHaveLength(1);
		expect(state.updatedWheres).toHaveLength(0);
	});

	it('404s instead of a silent success when not authorized', async () => {
		// Row exists, but the familyMembers lookup comes back empty → the
		// real canMutateTask denies the caller → 404, never a fake success.
		state.queue.push([taskRow()], []);

		const res = await DELETE(deleteEvent('user-stranger', 't1'));

		expect(res.status).toBe(404);
		expect(state.deletedWheres).toHaveLength(0);
	});

	it('404s an unknown id instead of success', async () => {
		const res = await DELETE(deleteEvent('user-owner', 'ghost'));

		expect(res.status).toBe(404);
		expect(state.deletedWheres).toHaveLength(0);
	});

	it('401s unauthenticated', async () => {
		const res = await DELETE({ locals: {} } as never);

		expect(res.status).toBe(401);
	});
});
