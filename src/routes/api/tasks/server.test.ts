import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Assignment-target validation on POST /api/tasks: assignedTo must be
 * the creator themself or an existing member of the target family —
 * anything else would create an invisible pending task. isValidAssignee
 * stays real (it is the logic under test); only the DB and the
 * surrounding seams are scripted/spied.
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

// oxlint-disable-next-line anti-slop/no-module-mocking -- isValidAssignee/normalizeTags stay real; DB seams become spies.
vi.mock('$lib/server/db/actions/tasks', async (importOriginal) => ({
	...(await importOriginal<object>()),
	createTask: vi.fn(),
	getTasksForUser: vi.fn(),
	getTasksForEvent: vi.fn(),
	isFamilyMember: vi.fn()
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted seam; the real module reads familyMembers from the DB.
vi.mock('$lib/server/db/actions/families', () => ({
	getUserFamilyId: vi.fn(async () => 'fam-1')
}));

import { POST } from './+server';
import { createTask } from '$lib/server/db/actions/tasks';

function event(userId: string, body: Record<string, string>) {
	// SAFETY: test double — the handler only reads locals.user and request.json().
	return {
		locals: { user: { id: userId } },
		request: {
			url: 'http://localhost/api/tasks',
			json: async () => body
		}
	} as never;
}

const mockedCreateTask = vi.mocked(createTask);

beforeEach(() => {
	state.queue = [];
	vi.clearAllMocks();
	// SAFETY: stub return satisfies the seam spy's nominal TaskWithTags parameter in tests.
	mockedCreateTask.mockResolvedValue({ id: 't1', title: 'Dishes' } as never);
});

describe('POST /api/tasks — assignment target validation', () => {
	it('defaults to self-assignment without a membership lookup', async () => {
		const res = await POST(event('user-1', { title: 'Dishes' }));

		expect(res.status).toBe(201);
		expect(mockedCreateTask).toHaveBeenCalledWith(
			expect.objectContaining({ assignedTo: 'user-1', assignmentStatus: 'accepted' })
		);
		expect(state.queue).toEqual([]);
	});

	it('accepts an existing member of the target family as assignee', async () => {
		state.queue.push([{ familyId: 'fam-1' }]); // isValidAssignee membership row

		const res = await POST(event('user-1', { title: 'Dishes', assignedTo: 'user-2' }));

		expect(res.status).toBe(201);
		expect(mockedCreateTask).toHaveBeenCalledWith(
			expect.objectContaining({ assignedTo: 'user-2', assignmentStatus: 'pending' })
		);
	});

	it('400s when assignedTo is an unknown user id', async () => {
		state.queue.push([]); // no membership row

		const res = await POST(event('user-1', { title: 'Dishes', assignedTo: 'user-ghost' }));

		expect(res.status).toBe(400);
		expect(mockedCreateTask).not.toHaveBeenCalled();
	});

	it('400s when assignedTo belongs to another family', async () => {
		state.queue.push([]); // membership row for (assignedTo, fam-1) absent

		const res = await POST(event('user-1', { title: 'Dishes', assignedTo: 'user-9' }));

		expect(res.status).toBe(400);
		expect(mockedCreateTask).not.toHaveBeenCalled();
	});
});
