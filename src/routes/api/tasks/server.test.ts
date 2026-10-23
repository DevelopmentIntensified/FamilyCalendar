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
	/** Number of UPDATE statements the stub executed (pin audit). */
	updateCount: number;
	/** Latest UPDATE patch (the pinned dueDate). */
	updatePatch: Row | null;
}

const state = vi.hoisted((): StubState => ({ queue: [], updateCount: 0, updatePatch: null }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub pins query shapes; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => {
	/** The slice of the drizzle builder the task reads walk (sync + list + tags). */
	const node = () => {
		const n = {
			from: () => n,
			leftJoin: () => n,
			innerJoin: () => n,
			where: () => {
				const rows = state.queue.shift() ?? [];
				return Object.assign(Promise.resolve(rows), {
					orderBy: () => Promise.resolve(rows),
					// The eventId branch chains .limit(1) on its event lookup.
					limit: () => Promise.resolve(rows)
				});
			}
		};
		return n;
	};
	return {
		db: {
			select: () => node(),
			update: () => ({
				set: (patch: Row) => {
					state.updatePatch = patch;
					return {
						where: () => {
							state.updateCount += 1;
							return Promise.resolve();
						}
					};
				}
			})
		}
	};
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- createTask/isValidAssignee seams become spies; getTasksForUser stays REAL so the GET cursor-pin invariant (issue 110) runs end to end.
vi.mock('$lib/server/db/actions/tasks', async (importOriginal) => ({
	...(await importOriginal<object>()),
	createTask: vi.fn(),
	getTasksForEvent: vi.fn(),
	isFamilyMember: vi.fn()
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted seam; the real module reads familyMembers from the DB.
vi.mock('$lib/server/db/actions/families', () => ({
	getUserFamilyId: vi.fn(async () => 'fam-1')
}));

import { POST, GET } from './+server';
import { createTask, getTasksForEvent } from '$lib/server/db/actions/tasks';

const mockedGetEventTasks = vi.mocked(getTasksForEvent);

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
	state.updateCount = 0;
	state.updatePatch = null;
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

describe('POST /api/tasks — visibility (issue 019)', () => {
	it('defaults new tasks to public visibility', async () => {
		const res = await POST(event('user-1', { title: 'Dishes' }));

		expect(res.status).toBe(201);
		expect(mockedCreateTask).toHaveBeenCalledWith(
			expect.objectContaining({ visibility: 'public' })
		);
	});

	it('passes an explicit private visibility through', async () => {
		const res = await POST(event('user-1', { title: 'Dishes', visibility: 'private' }));

		expect(res.status).toBe(201);
		expect(mockedCreateTask).toHaveBeenCalledWith(
			expect.objectContaining({ visibility: 'private' })
		);
	});

	it('400s on an unsupported visibility value', async () => {
		const res = await POST(event('user-1', { title: 'Dishes', visibility: 'secret' }));

		expect(res.status).toBe(400);
		expect(mockedCreateTask).not.toHaveBeenCalled();
	});
});

describe('GET /api/tasks — recurring cursor pin invariant (issue 110)', () => {
	/** A GET event: the handler reads locals.user and url.searchParams. */
	function getEvent(userId: string) {
		// SAFETY: test double — RequestHandler input narrowed to the read path.
		return {
			locals: { user: { id: userId } },
			url: new URL('http://localhost/api/tasks')
		} as never;
	}

	it('pins overdue recurring rows to today-end BEFORE reading the list', async () => {
		// Queue order after the invariant lands: (1) sync SELECT scope,
		// (2) the list read, (3) attachTags. The sync SELECT returns one
		// overdue recurring row, so the pin UPDATE must fire.
		state.queue = [
			[{ id: 'stale-1', dueDate: '2020-01-01T00:00:00.000Z' }],
			[{ id: 'stale-1', dueDate: '2020-01-01T00:00:00.000Z' }],
			[]
		];

		const res = await GET(getEvent('user-1'));
		const body = (await res.json()) as { tasks: { id: string }[] };

		expect(res.status).toBe(200);
		expect(body.tasks.map((t) => t.id)).toEqual(['stale-1']);
		expect(state.updateCount).toBe(1);
		expect(String(state.updatePatch?.dueDate)).toMatch(/T23:59:00/);
	});

	it('issues no UPDATE when nothing is overdue (idempotent no-op)', async () => {
		state.queue = [
			[{ id: 'fresh-1', dueDate: '2099-09-02T23:59:00.000Z' }],
			[{ id: 'fresh-1', dueDate: '2099-09-02T23:59:00.000Z' }],
			[]
		];

		const res = await GET(getEvent('user-1'));

		expect(res.status).toBe(200);
		expect(state.updateCount).toBe(0);
	});
});

describe('GET /api/tasks?eventId= — event-task visibility (issue 164)', () => {
	function eventDetailEvent(userId: string) {
		// SAFETY: test double — the eventId GET branch reads locals.user + url.
		return {
			locals: { user: { id: userId } },
			url: new URL('http://localhost/api/tasks?eventId=ev-1')
		} as never;
	}

	it("hides the creator's private task from a non-owner member reading the event", async () => {
		// Queue order: (1) event lookup, (2) familyMembers for calendar scope,
		// (3) calendars — user-1 is a member with access to the family calendar.
		state.queue = [
			[{ id: 'ev-1', calendarId: 'cal-fam', ownerId: 'user-2' }],
			[{ familyId: 'fam-1' }],
			[{ id: 'cal-fam' }]
		];
		mockedGetEventTasks.mockResolvedValue([
			{ id: 't-pub', visibility: 'public', userId: 'user-2' },
			{ id: 't-priv', visibility: 'private', userId: 'user-2' }
		] as never);

		const res = await GET(eventDetailEvent('user-1'));
		const body = (await res.json()) as { tasks: { id: string }[] };

		expect(res.status).toBe(200);
		expect(body.tasks.map((t) => t.id)).toEqual(['t-pub']);
	});

	it('shows the owner their own private task on the event', async () => {
		state.queue = [[{ id: 'ev-1', calendarId: null, ownerId: 'user-1' }]];
		mockedGetEventTasks.mockResolvedValue([
			{ id: 't-priv-mine', visibility: 'private', userId: 'user-1' }
		] as never);

		const res = await GET(eventDetailEvent('user-1'));
		const body = (await res.json()) as { tasks: { id: string }[] };

		expect(res.status).toBe(200);
		expect(body.tasks.map((t) => t.id)).toEqual(['t-priv-mine']);
	});
});
