import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #280 category on PUT /api/tasks/[id]: absent = unchanged, null/blank =
 * clear, string = set (auto-added to the CALLER's list, stored in the list's
 * spelling). Applies to the owner write and the non-owner family write (#232).
 */
const state = vi.hoisted(() => ({ queue: [] as unknown[][] }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub (same pattern as server.test.ts); real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => Promise.resolve(state.queue.shift() ?? [])
			})
		})
	}
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- decision helpers stay real; DB seams become spies.
vi.mock('$lib/server/db/actions/tasks', async (importOriginal) => ({
	...(await importOriginal<object>()),
	updateTask: vi.fn(),
	updateTaskInFamily: vi.fn(),
	canMutateTask: vi.fn()
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- ensureTaskCategory writes to the DB; the parsers stay real.
vi.mock('$lib/server/db/actions/taskCategories', async (importOriginal) => ({
	...(await importOriginal<object>()),
	ensureTaskCategory: vi.fn()
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- spy seam; the real module writes to the DB.
vi.mock('$lib/server/db/actions/notifications', () => ({ createNotification: vi.fn() }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted zone; the real module reads user settings.
vi.mock('$lib/server/utils/userTimezone', () => ({
	getUserZone: vi.fn(async () => 'UTC'),
	zonedNow: vi.fn()
}));

import { PUT } from './+server';
import { updateTask, updateTaskInFamily, canMutateTask } from '$lib/server/db/actions/tasks';
import { ensureTaskCategory } from '$lib/server/db/actions/taskCategories';

const mockedUpdate = vi.mocked(updateTask);
const mockedUpdateInFamily = vi.mocked(updateTaskInFamily);
const mockedEnsure = vi.mocked(ensureTaskCategory);

function put(userId: string, body: Record<string, unknown>) {
	// SAFETY: test double — the handler only reads locals.user, url.pathname, and request.json().
	return {
		locals: { user: { id: userId } },
		url: new URL('http://localhost/api/tasks/t1'),
		request: { url: 'http://localhost/api/tasks/t1', json: async () => body }
	} as never;
}

const familyTask = {
	id: 't1',
	title: 'Dishes',
	userId: 'owner',
	familyId: 'fam-1',
	assignedTo: null,
	assignmentStatus: 'none',
	category: 'Old'
};

beforeEach(() => {
	state.queue = [];
	vi.clearAllMocks();
	// SAFETY: stub satisfies the nominal TaskWithTags return in tests.
	mockedUpdate.mockImplementation(async (_id, _u, d) => ({ ...familyTask, ...d }) as never);
	vi.mocked(canMutateTask).mockResolvedValue(true);
	mockedEnsure.mockImplementation(async (userId, name) => ({
		id: 'c1',
		userId,
		name: name.toLowerCase() === 'work' ? 'Work' : name,
		createdAt: new Date(),
		updatedAt: new Date()
	}));
});

describe('PUT /api/tasks/[id] — category (#280), owner', () => {
	it('absent -> unchanged (not in the patch), nothing auto-added', async () => {
		const res = await PUT(put('owner', { title: 'Dishes!' }));
		expect(res.status).toBe(200);
		expect(mockedUpdate.mock.calls[0][2].category).toBeUndefined();
		expect(mockedEnsure).not.toHaveBeenCalled();
	});

	it.each([[null], [''], ['  ']])('%j -> clears (category null)', async (category) => {
		const res = await PUT(put('owner', { category }));
		expect(res.status).toBe(200);
		expect(mockedUpdate).toHaveBeenCalledWith('t1', 'owner', expect.objectContaining({ category: null }));
		expect((await res.json()).task.category).toBeNull();
		expect(mockedEnsure).not.toHaveBeenCalled();
	});

	it('string -> set, auto-added to the caller list', async () => {
		const res = await PUT(put('owner', { category: ' Errands ' }));
		expect(res.status).toBe(200);
		expect(mockedEnsure).toHaveBeenCalledWith('owner', 'Errands');
		expect(mockedUpdate).toHaveBeenCalledWith('t1', 'owner', expect.objectContaining({ category: 'Errands' }));
		expect((await res.json()).task.category).toBe('Errands');
	});

	it("a case variant is stored in the list's spelling", async () => {
		await PUT(put('owner', { category: 'work' }));
		expect(mockedUpdate).toHaveBeenCalledWith('t1', 'owner', expect.objectContaining({ category: 'Work' }));
	});

	it('400 category is too long, before any mutation', async () => {
		const res = await PUT(put('owner', { category: 'x'.repeat(81) }));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'category is too long' });
		expect(mockedUpdate).not.toHaveBeenCalled();
		expect(mockedEnsure).not.toHaveBeenCalled();
	});

	it.each([[3], [false], [['a']]])('400 non-string %j', async (category) => {
		const res = await PUT(put('owner', { category }));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'category must be a string' });
		expect(mockedUpdate).not.toHaveBeenCalled();
	});
});

describe('PUT /api/tasks/[id] — category (#280), non-owner family member (#232)', () => {
	it('sets the category through the family write, auto-adding to the EDITOR list', async () => {
		mockedUpdate.mockResolvedValue(undefined); // not the owner
		state.queue.push([familyTask]); // non-owner fallback loads the task
		// SAFETY: stub satisfies the nominal TaskWithTags return in tests.
		mockedUpdateInFamily.mockImplementation(async (_id, _f, d) => ({ ...familyTask, ...d }) as never);

		const res = await PUT(put('member', { category: 'Chores' }));

		expect(res.status).toBe(200);
		expect(mockedEnsure).toHaveBeenCalledWith('member', 'Chores');
		expect(mockedUpdateInFamily).toHaveBeenCalledWith(
			't1',
			'fam-1',
			expect.objectContaining({ category: 'Chores' })
		);
		expect((await res.json()).task.category).toBe('Chores');
	});

	it('clears via the family write', async () => {
		mockedUpdate.mockResolvedValue(undefined);
		state.queue.push([familyTask]);
		// SAFETY: stub satisfies the nominal TaskWithTags return in tests.
		mockedUpdateInFamily.mockImplementation(async (_id, _f, d) => ({ ...familyTask, ...d }) as never);

		const res = await PUT(put('member', { category: null }));

		expect(res.status).toBe(200);
		expect(mockedUpdateInFamily).toHaveBeenCalledWith('t1', 'fam-1', expect.objectContaining({ category: null }));
	});
});
