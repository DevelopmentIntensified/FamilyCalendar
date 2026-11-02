import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Assignment authorization on PUT /api/tasks/[id]: the task OWNER keeps
 * full control of the assignment patch, but a non-owner family member
 * may only respond to their OWN assignment (accept / decline). The
 * drizzle query-builder is scripted (same pattern as taskMutation.test.ts)
 * and the DB-hitting action seams are injected as spies.
 */
/** A stubbed DB row: plain JSON-ish values only (house stub style). */
type Row = Record<string, string | number | boolean | null | undefined>;

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
	isValidAssignee,
	toggleTaskComplete
} from '$lib/server/db/actions/tasks';
import { createNotification } from '$lib/server/db/actions/notifications';

/** Stubbed task row — only the fields the PUT handler / seam spies read. */
type TaskStub = {
	id: string;
	title: string;
	userId: string;
	familyId: string | null;
	assignedTo: string | null;
	assignmentStatus: string;
	recurrenceFrequency?: string | null;
	recurrenceInterval?: number | null;
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

function event(userId: string, body: Record<string, unknown>) {
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

describe('PUT /api/tasks/[id] toggleComplete — completion notification direction (#229)', () => {
	const toggle = (userId: string) => PUT(event(userId, { toggleComplete: true }));
	const mockedToggle = vi.mocked(toggleTaskComplete);

	const cases: [string, Record<string, unknown>, Record<string, unknown>, boolean][] = [
		// label, row before, row after, notifies owner?
		['open one-off -> done notifies', { completedAt: null }, { completedAt: '2026-11-01T10:00:00Z' }, true],
		['done one-off -> open (un-check) does NOT notify', { completedAt: '2026-11-01T10:00:00Z' }, { completedAt: null }, false],
		[
			'recurring advance (count +1) notifies',
			{ completedAt: null, recurrenceFrequency: 'daily', completionCount: 3 },
			{ completedAt: null, recurrenceFrequency: 'daily', completionCount: 4 },
			true
		],
		[
			'recurring double-tap (guard miss, count unchanged) does NOT notify',
			{ completedAt: null, recurrenceFrequency: 'daily', completionCount: 4 },
			{ completedAt: null, recurrenceFrequency: 'daily', completionCount: 4 },
			false
		],
		[
			'legacy completed recurring row un-checked does NOT notify',
			{ completedAt: '2026-11-01T10:00:00Z', recurrenceFrequency: 'daily', completionCount: 4 },
			{ completedAt: null, recurrenceFrequency: 'daily', completionCount: 4 },
			false
		]
	];
	for (const [label, before, after, notifies] of cases) {
		it(label, async () => {
			state.queue.push([{ ...taskRow(), ...before } as Row]); // pre-toggle row
			state.queue.push([{ firstName: 'Ali' }]); // getActorName
			mockedToggle.mockResolvedValue({ ...taskRow(), ...after } as never);

			const res = await toggle('user-assignee');

			expect(res.status).toBe(200);
			if (notifies) {
				expect(createNotification).toHaveBeenCalledWith(
					expect.objectContaining({ userId: 'user-owner', type: 'task_completed' })
				);
			} else {
				expect(createNotification).not.toHaveBeenCalled();
			}
		});
	}

	it('never notifies the owner about their own toggle', async () => {
		state.queue.push([{ ...taskRow(), completedAt: null } as Row]);
		mockedToggle.mockResolvedValue({ ...taskRow(), completedAt: '2026-11-01T10:00:00Z' } as never);

		const res = await toggle('user-owner');

		expect(res.status).toBe(200);
		expect(createNotification).not.toHaveBeenCalled();
	});
});

describe('PUT /api/tasks/[id] — recurrence patch (#231)', () => {
	const patchOf = () => mockedUpdateTask.mock.calls[0][2] as Record<string, unknown>;

	beforeEach(() => {
		mockedUpdateTask.mockResolvedValue(taskRow() as never);
	});

	it('interval alone on a recurring task patches the interval', async () => {
		state.queue.push([taskRow({ userId: 'user-owner', recurrenceFrequency: 'weekly', recurrenceInterval: 1 })]);

		const res = await PUT(event('user-owner', { recurrenceInterval: 2 }));

		expect(res.status).toBe(200);
		expect(patchOf().recurrenceInterval).toBe(2);
		expect(patchOf().recurrenceFrequency).toBeUndefined();
	});

	it('interval alone floors and clamps to >= 1', async () => {
		state.queue.push([taskRow({ recurrenceFrequency: 'daily' })]);

		await PUT(event('user-owner', { recurrenceInterval: 0.4 }));

		expect(patchOf().recurrenceInterval).toBe(1);
	});

	it('interval alone on a non-recurring task leaves recurrence untouched', async () => {
		state.queue.push([taskRow({ recurrenceFrequency: null, recurrenceInterval: null })]);

		const res = await PUT(event('user-owner', { recurrenceInterval: 2 }));

		expect(res.status).toBe(200);
		expect(patchOf().recurrenceInterval).toBeUndefined();
	});

	it('frequency + interval patches both', async () => {
		const res = await PUT(event('user-owner', { recurrenceFrequency: 'monthly', recurrenceInterval: 3 }));

		expect(res.status).toBe(200);
		expect(patchOf()).toMatchObject({ recurrenceFrequency: 'monthly', recurrenceInterval: 3 });
	});

	it('frequency null clears both', async () => {
		await PUT(event('user-owner', { recurrenceFrequency: null, recurrenceInterval: 4 }));

		expect(patchOf()).toMatchObject({ recurrenceFrequency: null, recurrenceInterval: null });
	});

	for (const bad of ['fortnightly', 'Weekly', '', 7]) {
		it(`400s an unknown frequency ${JSON.stringify(bad)} before any mutation`, async () => {
			const res = await PUT(event('user-owner', { recurrenceFrequency: bad }));

			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({ error: 'Invalid recurrenceFrequency' });
			expect(mockedUpdateTask).not.toHaveBeenCalled();
		});
	}

	for (const bad of ['2', 'abc', Number.NaN, Number.POSITIVE_INFINITY, true]) {
		it(`400s an invalid interval ${String(bad)} before any mutation`, async () => {
			state.queue.push([taskRow({ recurrenceFrequency: 'weekly' })]);

			const res = await PUT(event('user-owner', { recurrenceInterval: bad }));

			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({ error: 'Invalid recurrenceInterval' });
			expect(mockedUpdateTask).not.toHaveBeenCalled();
		});
	}
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
describe('PUT /api/tasks/[id] — focusMinutes (021 device-channel spec)', () => {
	it('absent field: patch carries undefined (stored minutes untouched)', async () => {
		state.queue.push([taskRow()]);
		mockedUpdateTask.mockResolvedValue(taskRow() as never);

		const res = await PUT(event('user-owner', { title: 'Renamed' }));

		expect(res.status).toBe(200);
		expect(mockedUpdateTask).toHaveBeenCalledWith('t1', 'user-owner', {
			title: 'Renamed',
			notes: undefined,
			dueDate: undefined,
			priority: undefined,
			visibility: undefined,
			recurrenceFrequency: undefined,
			recurrenceInterval: undefined,
			completedAt: undefined,
			tags: undefined
		});
		const patch = mockedUpdateTask.mock.calls[0][2] as Record<string, unknown>;
		// The route passes the key with an undefined value; the real
		// updateTask filters undefined out of its SQL SET — stored minutes
		// stay untouched.
		expect(patch.focusMinutes).toBeUndefined();
	});

	it('explicit value overwrites (desktop push)', async () => {
		state.queue.push([taskRow()]);
		mockedUpdateTask.mockResolvedValue(taskRow() as never);

		const res = await PUT(event('user-owner', { focusMinutes: 42 }));

		expect(res.status).toBe(200);
		const patch = mockedUpdateTask.mock.calls[0][2] as Record<string, unknown>;
		expect(patch.focusMinutes).toBe(42);
	});

	it('null is tolerated as unchanged (phone edits never know the field)', async () => {
		state.queue.push([taskRow()]);
		mockedUpdateTask.mockResolvedValue(taskRow() as never);

		const res = await PUT(event('user-owner', { notes: 'x', focusMinutes: null }));

		expect(res.status).toBe(200);
		const patch = mockedUpdateTask.mock.calls[0][2] as Record<string, unknown>;
		expect(patch.focusMinutes).toBeUndefined();
	});

	it('rejects a negative value before any mutation', async () => {
		state.queue.push([taskRow()]);
		mockedUpdateTask.mockResolvedValue(taskRow() as never);

		const res = await PUT(event('user-owner', { focusMinutes: -3 }));

		expect(res.status).toBe(400);
		expect(mockedUpdateTask).not.toHaveBeenCalled();
	});

	it('rejects a fractional value', async () => {
		state.queue.push([taskRow()]);

		const res = await PUT(event('user-owner', { focusMinutes: 1.5 }));

		expect(res.status).toBe(400);
		expect(mockedUpdateTask).not.toHaveBeenCalled();
	});
});

describe('PUT /api/tasks/[id] — focusStartedAt (022: what is running)', () => {
	it('absent field leaves the stored stamp unchanged (phone edits)', async () => {
		state.queue.push([taskRow()]);
		mockedUpdateTask.mockResolvedValue(taskRow() as never);

		const res = await PUT(event('user-owner', { title: 'Renamed' }));

		expect(res.status).toBe(200);
		const patch = mockedUpdateTask.mock.calls[0][2] as Record<string, unknown>;
		expect(patch.focusStartedAt).toBeUndefined();
	});

	it('an ISO stamp overwrites (desktop start)', async () => {
		state.queue.push([taskRow()]);
		mockedUpdateTask.mockResolvedValue(taskRow() as never);

		const res = await PUT(event('user-owner', { focusStartedAt: '2026-11-01T12:00:00.0000000Z' }));

		expect(res.status).toBe(200);
		const patch = mockedUpdateTask.mock.calls[0][2] as Record<string, unknown>;
		expect(patch.focusStartedAt).toBeInstanceOf(Date);
		expect((patch.focusStartedAt as Date).toISOString()).toBe('2026-11-01T12:00:00.000Z');
	});

	it('explicit null clears it (desktop stop) — unlike focusMinutes, null is a value', async () => {
		state.queue.push([taskRow()]);
		mockedUpdateTask.mockResolvedValue(taskRow() as never);

		const res = await PUT(event('user-owner', { focusMinutes: 30, focusStartedAt: null }));

		expect(res.status).toBe(200);
		const patch = mockedUpdateTask.mock.calls[0][2] as Record<string, unknown>;
		expect('focusStartedAt' in patch).toBe(true);
		expect(patch.focusStartedAt).toBeNull();
		expect(patch.focusMinutes).toBe(30);
	});

	it('rejects an unparseable stamp before any mutation', async () => {
		state.queue.push([taskRow()]);

		const res = await PUT(event('user-owner', { focusStartedAt: 'soon' }));

		expect(res.status).toBe(400);
		expect(mockedUpdateTask).not.toHaveBeenCalled();
	});

	it('rejects a non-string stamp', async () => {
		state.queue.push([taskRow()]);

		const res = await PUT(event('user-owner', { focusStartedAt: 12345 }));

		expect(res.status).toBe(400);
		expect(mockedUpdateTask).not.toHaveBeenCalled();
	});
});

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
