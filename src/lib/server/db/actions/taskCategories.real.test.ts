import { afterAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * REAL-Postgres check of the drizzle TaskCategoryStore (#280): the
 * case-insensitive unique index (024), and the rename/delete propagation
 * scope (caller's owned OR assigned tasks, case-insensitive name match).
 * Needs the #002 harness DB (`npm run db:push:test`).
 */
import { db } from '$lib/server/db';
import { taskCategories, tasks, users } from '$lib/server/db/schema';
import { closeTestPool, resetTestDb } from '$lib/server/db/testHarness';
import {
	deleteTaskCategory,
	ensureTaskCategory,
	listTaskCategories,
	renameTaskCategory
} from './taskCategories';

afterAll(async () => {
	await closeTestPool();
});

const ME = 'cat-me';
const OTHER = 'cat-other';

async function seedUser(id: string) {
	await db.insert(users).values({ id, firstName: id, lastName: 'H', email: `${id}@h.invalid`, roles: [] });
}

async function seedTask(id: string, userId: string, assignedTo: string | null, category: string | null) {
	await db.insert(tasks).values({ id, title: id, userId, assignedTo, category });
}

async function categoryOf(id: string) {
	const rows = await db.select({ id: tasks.id, category: tasks.category }).from(tasks);
	return rows.find((r) => r.id === id)?.category;
}

beforeEach(async () => {
	await resetTestDb();
	await seedUser(ME);
	await seedUser(OTHER);
});

describe('task categories — real Postgres', () => {
	it('ensure is idempotent case-insensitively; the index rejects a raw duplicate', async () => {
		const a = await ensureTaskCategory(ME, 'Work');
		const b = await ensureTaskCategory(ME, 'WORK');
		expect(b.id).toBe(a.id);
		await expect(db.insert(taskCategories).values({ userId: ME, name: 'work' })).rejects.toThrow();
		expect((await listTaskCategories(ME)).map((c) => c.name)).toEqual(['Work']);
	});

	it("rename propagates to the caller's owned + assigned tasks only; 409 on clash", async () => {
		const work = await ensureTaskCategory(ME, 'Work');
		await ensureTaskCategory(ME, 'Home');
		await ensureTaskCategory(OTHER, 'Work');
		await seedTask('own', ME, null, 'work');
		await seedTask('assigned', OTHER, ME, 'Work');
		await seedTask('others', OTHER, null, 'Work');

		expect(await renameTaskCategory(ME, work.id, 'home')).toEqual({ status: 'conflict' });
		const res = await renameTaskCategory(ME, work.id, 'Deep Work');
		expect(res).toMatchObject({ status: 'ok', category: { name: 'Deep Work' } });
		expect(await categoryOf('own')).toBe('Deep Work');
		expect(await categoryOf('assigned')).toBe('Deep Work');
		expect(await categoryOf('others')).toBe('Work');
	});

	it("delete nulls the caller's tasks and leaves others", async () => {
		const work = await ensureTaskCategory(ME, 'Work');
		await seedTask('own', ME, null, 'Work');
		await seedTask('others', OTHER, null, 'Work');
		expect(await deleteTaskCategory(OTHER, work.id)).toBe(false);
		expect(await deleteTaskCategory(ME, work.id)).toBe(true);
		expect(await categoryOf('own')).toBeNull();
		expect(await categoryOf('others')).toBe('Work');
		expect(await listTaskCategories(ME)).toEqual([]);
	});
});
