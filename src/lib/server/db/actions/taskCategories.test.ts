import { describe, it, expect, vi } from 'vitest';
import {
	parseTaskCategory,
	parseCategoryName,
	listTaskCategories,
	listCategoryOptions,
	ensureTaskCategory,
	renameTaskCategory,
	deleteTaskCategory,
	type TaskCategoryStore
} from './taskCategories';
import type { TaskCategory } from '$lib/server/db/schema';

/**
 * #280 task categories. The store is the DB seam (drizzle impl covered by
 * taskCategories.real.test.ts); this in-memory fake models the documented
 * store contract: names unique per user case-insensitively, and the
 * rename/delete propagation scope = the caller's tasks (owned OR assigned to
 * the caller) carrying the old name, case-insensitively.
 */
type FakeTask = { id: string; userId: string; assignedTo: string | null; category: string | null };

function fakeStore(seed: { categories?: TaskCategory[]; tasks?: FakeTask[] } = {}) {
	const categories: TaskCategory[] = [...(seed.categories ?? [])];
	const tasks: FakeTask[] = (seed.tasks ?? []).map((t) => ({ ...t }));
	let n = 0;
	const lower = (s: string) => s.toLowerCase();
	const retag = (userId: string, from: string, to: string | null) => {
		for (const t of tasks) {
			if (
				(t.userId === userId || t.assignedTo === userId) &&
				t.category !== null &&
				lower(t.category) === lower(from)
			) {
				t.category = to;
			}
		}
	};
	const store: TaskCategoryStore = {
		list: async (userId) => categories.filter((c) => c.userId === userId),
		findById: async (userId, id) => categories.find((c) => c.userId === userId && c.id === id),
		findByName: async (userId, name) =>
			categories.find((c) => c.userId === userId && lower(c.name) === lower(name)),
		insert: async (userId, name) => {
			if (categories.some((c) => c.userId === userId && lower(c.name) === lower(name))) {
				return undefined;
			}
			const now = new Date('2026-11-02T00:00:00Z');
			const row = { id: `c${++n}`, userId, name, createdAt: now, updatedAt: now };
			categories.push(row);
			return row;
		},
		renameWithTasks: async (userId, category, name) => {
			const row = categories.find((c) => c.id === category.id)!;
			if (
				categories.some(
					(c) => c.userId === userId && c.id !== row.id && lower(c.name) === lower(name)
				)
			) {
				return undefined;
			}
			retag(userId, row.name, name);
			row.name = name;
			row.updatedAt = new Date('2026-11-03T00:00:00Z');
			return row;
		},
		deleteWithTasks: async (userId, category) => {
			categories.splice(categories.indexOf(category), 1);
			retag(userId, category.name, null);
		}
	};
	return { store, categories, tasks };
}

const cat = (id: string, userId: string, name: string): TaskCategory => ({
	id,
	userId,
	name,
	createdAt: new Date('2026-11-01T00:00:00Z'),
	updatedAt: new Date('2026-11-01T00:00:00Z')
});

describe('parseTaskCategory (task field)', () => {
	it.each([
		[null, null],
		['', null],
		['   ', null],
		['Work', 'Work'],
		['  Deep Work \n', 'Deep Work'],
		['x'.repeat(80), 'x'.repeat(80)]
	])('%j -> %j', (raw, value) => {
		expect(parseTaskCategory(raw)).toEqual({ ok: true, value });
	});

	it('81 chars -> category is too long', () => {
		expect(parseTaskCategory('x'.repeat(81))).toEqual({ ok: false, error: 'category is too long' });
	});

	it('length is checked after trimming', () => {
		expect(parseTaskCategory(`  ${'x'.repeat(80)}  `)).toEqual({ ok: true, value: 'x'.repeat(80) });
	});

	it.each([[42], [true], [{}], [['Work']]])('non-string %j -> category must be a string', (raw) => {
		expect(parseTaskCategory(raw)).toEqual({ ok: false, error: 'category must be a string' });
	});
});

describe('parseCategoryName (list endpoints)', () => {
	it('trims', () => {
		expect(parseCategoryName('  Errands ')).toEqual({ ok: true, value: 'Errands' });
	});
	it.each([[undefined], [null], [''], ['  '], [7]])('%j -> name is required', (raw) => {
		expect(parseCategoryName(raw)).toEqual({ ok: false, error: 'name is required' });
	});
	it('>80 -> name is too long', () => {
		expect(parseCategoryName('y'.repeat(81))).toEqual({ ok: false, error: 'name is too long' });
	});
});

describe('listTaskCategories', () => {
	it("returns only the caller's categories, name-sorted case-insensitively", async () => {
		const { store } = fakeStore({
			categories: [
				cat('1', 'u1', 'work'),
				cat('2', 'u2', 'Alpha'),
				cat('3', 'u1', 'Errands'),
				cat('4', 'u1', 'admin')
			]
		});
		const list = await listTaskCategories('u1', store);
		expect(list.map((c) => c.name)).toEqual(['admin', 'Errands', 'work']);
	});
});

describe('listCategoryOptions (page loaders, #280 web UI)', () => {
	it('returns {id, name} only, name-sorted', async () => {
		const { store } = fakeStore({
			categories: [cat('1', 'u1', 'work'), cat('3', 'u1', 'Errands'), cat('2', 'u2', 'x')]
		});
		expect(await listCategoryOptions('u1', store)).toEqual([
			{ id: '3', name: 'Errands' },
			{ id: '1', name: 'work' }
		]);
	});

	it('degrades to [] when the read fails (page still renders)', async () => {
		const { store } = fakeStore();
		const broken: TaskCategoryStore = {
			...store,
			list: async () => {
				throw new Error('relation "task_categories" does not exist');
			}
		};
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await listCategoryOptions('u1', broken)).toEqual([]);
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});
});

describe('ensureTaskCategory (auto-add / idempotent POST)', () => {
	it('adds an unknown name to the caller list', async () => {
		const { store, categories } = fakeStore();
		const row = await ensureTaskCategory('u1', 'Work', store);
		expect(row.name).toBe('Work');
		expect(categories.map((c) => [c.userId, c.name])).toEqual([['u1', 'Work']]);
	});

	it('returns the existing row for a case-insensitive match (no duplicate)', async () => {
		const { store, categories } = fakeStore({ categories: [cat('1', 'u1', 'Work')] });
		const row = await ensureTaskCategory('u1', 'WORK', store);
		expect(row).toMatchObject({ id: '1', name: 'Work' });
		expect(categories).toHaveLength(1);
	});

	it("another user's identical name does not count", async () => {
		const { store, categories } = fakeStore({ categories: [cat('1', 'u2', 'Work')] });
		const row = await ensureTaskCategory('u1', 'Work', store);
		expect(row.id).not.toBe('1');
		expect(categories).toHaveLength(2);
	});

	it('a concurrent insert (conflict) resolves to the winning row', async () => {
		const { store } = fakeStore();
		let raced = false;
		const racing: TaskCategoryStore = {
			...store,
			findByName: async (u, n) => (raced ? store.findByName(u, n) : undefined),
			insert: async (u, n) => {
				await store.insert(u, n); // the other request wins
				raced = true;
				return undefined;
			}
		};
		const row = await ensureTaskCategory('u1', 'Work', racing);
		expect(row.name).toBe('Work');
	});
});

describe('renameTaskCategory', () => {
	const seed = () =>
		fakeStore({
			categories: [cat('1', 'u1', 'Work'), cat('2', 'u1', 'Home'), cat('9', 'u2', 'Work')],
			tasks: [
				{ id: 'own', userId: 'u1', assignedTo: null, category: 'Work' },
				{ id: 'own-lower', userId: 'u1', assignedTo: 'u1', category: 'work' },
				{ id: 'assigned', userId: 'u2', assignedTo: 'u1', category: 'Work' },
				{ id: 'others', userId: 'u2', assignedTo: 'u2', category: 'Work' },
				{ id: 'other-cat', userId: 'u1', assignedTo: null, category: 'Home' }
			]
		});

	it("renames and propagates to the caller's owned + assigned tasks only", async () => {
		const { store, tasks } = seed();
		const res = await renameTaskCategory('u1', '1', 'Deep Work', store);
		expect(res).toMatchObject({ status: 'ok', category: { id: '1', name: 'Deep Work' } });
		expect(Object.fromEntries(tasks.map((t) => [t.id, t.category]))).toEqual({
			own: 'Deep Work',
			'own-lower': 'Deep Work',
			assigned: 'Deep Work',
			others: 'Work',
			'other-cat': 'Home'
		});
	});

	it('409 conflict when another of the caller categories has the name (case-insensitive)', async () => {
		const { store, tasks } = seed();
		expect(await renameTaskCategory('u1', '1', 'HOME', store)).toEqual({ status: 'conflict' });
		expect(tasks.find((t) => t.id === 'own')!.category).toBe('Work');
	});

	it('a case-only rename of the same category is allowed', async () => {
		const { store } = seed();
		const res = await renameTaskCategory('u1', '1', 'WORK', store);
		expect(res).toMatchObject({ status: 'ok', category: { name: 'WORK' } });
	});

	it("not_found for an unknown id or another user's category", async () => {
		const { store } = seed();
		expect(await renameTaskCategory('u1', 'nope', 'X', store)).toEqual({ status: 'not_found' });
		expect(await renameTaskCategory('u1', '9', 'X', store)).toEqual({ status: 'not_found' });
	});
});

describe('deleteTaskCategory', () => {
	it("removes it and nulls the caller's tasks carrying the name", async () => {
		const { store, tasks, categories } = fakeStore({
			categories: [cat('1', 'u1', 'Work'), cat('9', 'u2', 'Work')],
			tasks: [
				{ id: 'own', userId: 'u1', assignedTo: null, category: 'work' },
				{ id: 'assigned', userId: 'u2', assignedTo: 'u1', category: 'Work' },
				{ id: 'others', userId: 'u2', assignedTo: null, category: 'Work' }
			]
		});
		expect(await deleteTaskCategory('u1', '1', store)).toBe(true);
		expect(categories.map((c) => c.id)).toEqual(['9']);
		expect(tasks.map((t) => t.category)).toEqual([null, null, 'Work']);
	});

	it("false for an unknown id or another user's category", async () => {
		const { store, categories } = fakeStore({ categories: [cat('9', 'u2', 'Work')] });
		expect(await deleteTaskCategory('u1', '9', store)).toBe(false);
		expect(await deleteTaskCategory('u1', 'x', store)).toBe(false);
		expect(categories).toHaveLength(1);
	});
});
