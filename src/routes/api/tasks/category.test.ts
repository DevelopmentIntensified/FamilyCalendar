import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #280 task category on POST /api/tasks and on the GET list shape.
 * parseTaskCategory stays real; ensureTaskCategory (DB) is a spy that
 * returns the caller list's canonical row.
 */
const state = vi.hoisted(() => ({ selected: [] as Record<string, unknown>[], queue: [] as unknown[][] }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted drizzle stub records the list SELECT's field map; real-Postgres harness tracked in docs/issues/002.
vi.mock('$lib/server/db', () => {
	const node = () => {
		const n = {
			from: () => n,
			leftJoin: () => n,
			innerJoin: () => n,
			where: () => {
				const rows = state.queue.shift() ?? [];
				return Object.assign(Promise.resolve(rows), {
					orderBy: () => Promise.resolve(rows),
					limit: () => Promise.resolve(rows)
				});
			}
		};
		return n;
	};
	return {
		db: {
			select: (fields?: Record<string, unknown>) => {
				if (fields) state.selected.push(fields);
				return node();
			},
			update: () => ({ set: () => ({ where: () => Promise.resolve() }) })
		}
	};
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- createTask becomes a spy; getTasksForUser stays real so its SELECT shape is observed.
vi.mock('$lib/server/db/actions/tasks', async (importOriginal) => ({
	...(await importOriginal<object>()),
	createTask: vi.fn()
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- ensureTaskCategory writes to the DB; the parsers stay real.
vi.mock('$lib/server/db/actions/taskCategories', async (importOriginal) => ({
	...(await importOriginal<object>()),
	ensureTaskCategory: vi.fn()
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted seam; the real module reads familyMembers from the DB.
vi.mock('$lib/server/db/actions/families', () => ({
	getUserFamilyId: vi.fn(async () => 'fam-1')
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted zone; the real module reads user settings.
vi.mock('$lib/server/db/actions/userSettings', () => ({
	getUserSettings: vi.fn(async () => null)
}));

import { POST, GET } from './+server';
import { createTask } from '$lib/server/db/actions/tasks';
import { ensureTaskCategory } from '$lib/server/db/actions/taskCategories';

const mockedCreate = vi.mocked(createTask);
const mockedEnsure = vi.mocked(ensureTaskCategory);

function post(body: Record<string, unknown>) {
	// SAFETY: test double — the handler only reads locals.user and request.json().
	return {
		locals: { user: { id: 'u1' } },
		request: { url: 'http://localhost/api/tasks', json: async () => body }
	} as never;
}

beforeEach(() => {
	state.selected = [];
	state.queue = [];
	vi.clearAllMocks();
	// SAFETY: stub satisfies the nominal TaskWithTags return in tests.
	mockedCreate.mockImplementation(async (d) => ({ id: 't1', ...d }) as never);
	mockedEnsure.mockImplementation(async (userId, name) => ({
		id: 'c1',
		userId,
		// The caller's list already spells it "Work".
		name: name.toLowerCase() === 'work' ? 'Work' : name,
		createdAt: new Date(),
		updatedAt: new Date()
	}));
});

describe('POST /api/tasks — category (#280)', () => {
	it('absent -> null, nothing auto-added', async () => {
		const res = await POST(post({ title: 'Dishes' }));
		expect(res.status).toBe(201);
		expect(mockedCreate).toHaveBeenCalledWith(expect.objectContaining({ category: null }));
		expect(mockedEnsure).not.toHaveBeenCalled();
	});

	it.each([[null], [''], ['   ']])('%j -> null', async (category) => {
		const res = await POST(post({ title: 'Dishes', category }));
		expect(res.status).toBe(201);
		expect(mockedCreate).toHaveBeenCalledWith(expect.objectContaining({ category: null }));
		expect(mockedEnsure).not.toHaveBeenCalled();
	});

	it('a new name is trimmed, auto-added to the caller list and stored', async () => {
		const res = await POST(post({ title: 'Dishes', category: '  Chores ' }));
		expect(res.status).toBe(201);
		expect(mockedEnsure).toHaveBeenCalledWith('u1', 'Chores');
		expect(mockedCreate).toHaveBeenCalledWith(expect.objectContaining({ category: 'Chores' }));
		expect((await res.json()).task.category).toBe('Chores');
	});

	it("a case variant of an existing name is stored in the list's spelling", async () => {
		await POST(post({ title: 'Report', category: 'WORK' }));
		expect(mockedCreate).toHaveBeenCalledWith(expect.objectContaining({ category: 'Work' }));
	});

	it('400 category is too long (>80 after trim)', async () => {
		const res = await POST(post({ title: 'Dishes', category: 'x'.repeat(81) }));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'category is too long' });
		expect(mockedCreate).not.toHaveBeenCalled();
		expect(mockedEnsure).not.toHaveBeenCalled();
	});

	it.each([[5], [true], [['Work']], [{ name: 'Work' }]])('400 non-string %j', async (category) => {
		const res = await POST(post({ title: 'Dishes', category }));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'category must be a string' });
		expect(mockedCreate).not.toHaveBeenCalled();
	});
});

describe('GET /api/tasks — category on the list shape (#280)', () => {
	it('the list SELECT includes category and the row carries it', async () => {
		state.queue = [[], [{ id: 't1', category: 'Work' }], []]; // sync scope, list, tags
		const res = await GET({
			locals: { user: { id: 'u1' } },
			url: new URL('http://localhost/api/tasks')
		} as never);
		expect(res.status).toBe(200);
		expect((await res.json()).tasks[0].category).toBe('Work');
		expect(state.selected.some((f) => 'category' in f && 'focusMinutes' in f)).toBe(true);
	});
});
