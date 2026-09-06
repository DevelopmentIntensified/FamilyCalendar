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
}

const state = vi.hoisted((): StubState => ({ queue: [] }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => Promise.resolve(state.queue.shift() ?? [])
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

import { PUT } from './+server';
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
