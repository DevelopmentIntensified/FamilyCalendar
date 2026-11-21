/**
 * tasks category services against real Postgres: the name-sorted read, the
 * idempotent add that keeps the list's spelling, and the two propagation
 * transactions (rename, delete) scoped to the caller's owned-or-assigned
 * Tasks. Every test runs in `rollbackTest`; the ctx pins the clock, so an
 * insert's `createdAt`/`updatedAt` are exact.
 *
 * Expected values come from legacy `db/actions/taskCategories.ts` and the
 * frozen golden `tasks.http.db.test.ts`.
 *
 * Doc: ./README.md#how-to-test
 */
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import { taskCategories, tasks } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import {
	addTaskCategory,
	listTaskCategories,
	removeTaskCategory,
	renameTaskCategory
} from './tasks.categories.service.server';
import { seedTask, seedTaskCategory } from './tasks.fixtures.server';

const NOW = '2026-03-01T09:00:00.000Z';

describe('listTaskCategories', () => {
	rollbackTest('reads the caller`s rows name-sorted case-insensitively, with ISO stamps', async (db) => {
		const mia = await seedUser(db);
		const sam = await seedUser(db);
		await seedTaskCategory(db, mia.id, 'zebra');
		await seedTaskCategory(db, mia.id, 'Home');
		await seedTaskCategory(db, mia.id, 'apple');
		await seedTaskCategory(db, sam.id, 'work');
		const ctx = testCtx({ db, now: NOW });

		const rows = await listTaskCategories(ctx, actorFromUser(mia, 'session'));

		expect(rows.map((row) => row.name)).toEqual(['apple', 'Home', 'zebra']);
		// Seeded rows carry the database's default stamps; the wire shape is ISO.
		expect(rows[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
		expect(rows[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
	});
});

describe('addTaskCategory', () => {
	rollbackTest('is idempotent and reuses the stored spelling for any case', async (db) => {
		const mia = await seedUser(db);
		await seedTaskCategory(db, mia.id, 'Work');
		const ctx = testCtx({ db, now: NOW });

		const added = await addTaskCategory(ctx, actorFromUser(mia, 'session'), { name: 'work' });

		expect(added.name).toBe('Work');
		const rows = await db
			.select()
			.from(taskCategories)
			.where(eq(taskCategories.userId, mia.id));
		expect(rows).toHaveLength(1);
	});

	rollbackTest('stamps a new row with the context clock', async (db) => {
		const mia = await seedUser(db);
		const ctx = testCtx({ db, now: NOW });

		const added = await addTaskCategory(ctx, actorFromUser(mia, 'session'), { name: 'Garden' });

		expect(added).toMatchObject({
			name: 'Garden',
			createdAt: '2026-03-01T09:00:00.000Z',
			updatedAt: '2026-03-01T09:00:00.000Z'
		});
	});
});

describe('renameTaskCategory', () => {
	rollbackTest('renames the caller`s owned and assigned tasks, not another user`s', async (db) => {
		const mia = await seedUser(db);
		const sam = await seedUser(db);
		const category = await seedTaskCategory(db, mia.id, 'Work');
		const owned = await seedTask(db, { title: 'Owned', userId: mia.id, category: 'work' });
		const assigned = await seedTask(db, {
			title: 'Assigned',
			userId: sam.id,
			assignedTo: mia.id,
			assignmentStatus: 'pending',
			category: 'WORK'
		});
		const theirs = await seedTask(db, { title: 'Theirs', userId: sam.id, category: 'Work' });
		const ctx = testCtx({ db, now: NOW });

		const renamed = await renameTaskCategory(ctx, actorFromUser(mia, 'session'), {
			categoryId: category.id,
			name: 'Job'
		});

		expect(renamed).toMatchObject({ name: 'Job', updatedAt: '2026-03-01T09:00:00.000Z' });
		const byId = async (id: string) =>
			(await db.select().from(tasks).where(eq(tasks.id, id)))[0];
		expect((await byId(owned.id)).category).toBe('Job');
		expect((await byId(assigned.id)).category).toBe('Job');
		expect((await byId(theirs.id)).category).toBe('Work');
	});

	rollbackTest('answers 409 on a name clash and 404 for an unknown or foreign id', async (db) => {
		const mia = await seedUser(db);
		const sam = await seedUser(db);
		const work = await seedTaskCategory(db, mia.id, 'Work');
		await seedTaskCategory(db, mia.id, 'Home');
		const sams = await seedTaskCategory(db, sam.id, 'Work');
		const ctx = testCtx({ db, now: NOW });
		const actor = actorFromUser(mia, 'session');

		await expect(
			renameTaskCategory(ctx, actor, { categoryId: work.id, name: 'home' })
		).rejects.toMatchObject({
			status: 409,
			message: 'A category with that name already exists'
		});
		await expect(
			renameTaskCategory(ctx, actor, { categoryId: 'no-such-id', name: 'Job' })
		).rejects.toMatchObject({ status: 404, message: 'Category not found' });
		await expect(
			renameTaskCategory(ctx, actor, { categoryId: sams.id, name: 'Job' })
		).rejects.toMatchObject({ status: 404, message: 'Category not found' });
	});
});

describe('removeTaskCategory', () => {
	rollbackTest('deletes the row and clears the name from the caller`s tasks', async (db) => {
		const mia = await seedUser(db);
		const sam = await seedUser(db);
		const category = await seedTaskCategory(db, mia.id, 'Work');
		const owned = await seedTask(db, { title: 'Owned', userId: mia.id, category: 'work' });
		const assigned = await seedTask(db, {
			title: 'Assigned',
			userId: sam.id,
			assignedTo: mia.id,
			assignmentStatus: 'accepted',
			category: 'Work'
		});
		const theirs = await seedTask(db, { title: 'Theirs', userId: sam.id, category: 'Work' });
		const ctx = testCtx({ db, now: NOW });

		await removeTaskCategory(ctx, actorFromUser(mia, 'session'), { categoryId: category.id });

		expect(
			await db.select().from(taskCategories).where(eq(taskCategories.userId, mia.id))
		).toEqual([]);
		const byId = async (id: string) =>
			(await db.select().from(tasks).where(eq(tasks.id, id)))[0];
		expect((await byId(owned.id)).category).toBeNull();
		expect((await byId(assigned.id)).category).toBeNull();
		expect((await byId(theirs.id)).category).toBe('Work');
	});

	rollbackTest('answers 404 Category not found for an unknown or foreign id', async (db) => {
		const mia = await seedUser(db);
		const sam = await seedUser(db);
		const sams = await seedTaskCategory(db, sam.id, 'Work');
		const ctx = testCtx({ db, now: NOW });
		const actor = actorFromUser(mia, 'session');

		await expect(
			removeTaskCategory(ctx, actor, { categoryId: 'no-such-id' })
		).rejects.toMatchObject({ status: 404, message: 'Category not found' });
		await expect(
			removeTaskCategory(ctx, actor, { categoryId: sams.id })
		).rejects.toMatchObject({ status: 404, message: 'Category not found' });
	});
});
