/**
 * The task-category repo against real Postgres: the case-insensitive per-user
 * list, the idempotent insert, and the two propagation transactions. Each test
 * runs in `rollbackTest`.
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import { taskCategories, tasks } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import {
	deleteCategoryWithTasks,
	findCategoryById,
	findCategoryByName,
	insertCategoryIfAbsent,
	listCategories,
	renameCategoryWithTasks
} from './tasks.category.repo.server';
import { seedTask, seedTaskCategory } from './tasks.fixtures.server';

const NOW = new Date('2026-03-01T10:00:00.000Z');

describe('category reads', () => {
	rollbackTest('listCategories reads the caller`s rows and no one else`s', async (db) => {
		const mia = await seedUser(db);
		const sam = await seedUser(db);
		await seedTaskCategory(db, mia.id, 'zebra');
		await seedTaskCategory(db, mia.id, 'home');
		await seedTaskCategory(db, sam.id, 'work');

		const rows = await listCategories(db, mia.id);
		// Unordered read: compare as a set, never heap order.
		expect(rows.map((row) => row.name).sort()).toEqual(['home', 'zebra']);
	});

	rollbackTest('findCategoryById scopes to the caller', async (db) => {
		const mia = await seedUser(db);
		const sam = await seedUser(db);
		const row = await seedTaskCategory(db, mia.id, 'home');
		expect((await findCategoryById(db, mia.id, row.id))?.id).toBe(row.id);
		expect(await findCategoryById(db, sam.id, row.id)).toBeNull();
		expect(await findCategoryById(db, mia.id, 'no-such-id')).toBeNull();
	});

	rollbackTest('findCategoryByName compares case-insensitively', async (db) => {
		const mia = await seedUser(db);
		const row = await seedTaskCategory(db, mia.id, 'Work');
		expect((await findCategoryByName(db, mia.id, 'work'))?.id).toBe(row.id);
		expect(await findCategoryByName(db, mia.id, 'home')).toBeNull();
	});
});

describe('insertCategoryIfAbsent', () => {
	rollbackTest('inserts a new name with the caller`s stamps', async (db) => {
		const mia = await seedUser(db);
		const created = await insertCategoryIfAbsent(db, { userId: mia.id, name: 'Deep Work', now: NOW });
		expect(created).toMatchObject({ name: 'Deep Work', createdAt: NOW, updatedAt: NOW });
	});

	rollbackTest('answers null for a case variant the unique index rejects', async (db) => {
		const mia = await seedUser(db);
		await seedTaskCategory(db, mia.id, 'Work');
		expect(await insertCategoryIfAbsent(db, { userId: mia.id, name: 'work', now: NOW })).toBeNull();
		expect((await db.select().from(taskCategories)).map((row) => row.name)).toEqual(['Work']);
	});
});

describe('renameCategoryWithTasks', () => {
	rollbackTest(
		'renames and re-tags the caller`s owned and assigned Tasks, not another user`s',
		async (db) => {
			const mia = await seedUser(db);
			const sam = await seedUser(db);
			const category = await seedTaskCategory(db, mia.id, 'home');
			const owned = await seedTask(db, { title: 'Owned', category: 'home', userId: mia.id });
			const assigned = await seedTask(db, {
				title: 'Assigned',
				category: 'HOME',
				assignedTo: mia.id,
				userId: sam.id
			});
			const theirs = await seedTask(db, { title: 'Theirs', category: 'home', userId: sam.id });

			const renamed = await renameCategoryWithTasks(db, {
				userId: mia.id,
				categoryId: category.id,
				oldName: 'home',
				newName: 'Errands',
				now: NOW
			});
			expect(renamed).toMatchObject({ name: 'Errands', updatedAt: NOW });
			const rows = await db.select().from(tasks);
			expect(rows.find((row) => row.id === owned.id)?.category).toBe('Errands');
			expect(rows.find((row) => row.id === assigned.id)?.category).toBe('Errands');
			expect(rows.find((row) => row.id === theirs.id)?.category).toBe('home');
		}
	);

	rollbackTest('answers null on a name clash and leaves the rows untouched', async (db) => {
		const mia = await seedUser(db);
		const category = await seedTaskCategory(db, mia.id, 'home');
		await seedTaskCategory(db, mia.id, 'Work');
		const row = await seedTask(db, { title: 'Owned', category: 'home', userId: mia.id });

		expect(
			await renameCategoryWithTasks(db, {
				userId: mia.id,
				categoryId: category.id,
				oldName: 'home',
				newName: 'work',
				now: NOW
			})
		).toBeNull();
		const [stored] = await db.select().from(tasks);
		expect(stored?.category).toBe('home');
	});
});

describe('deleteCategoryWithTasks', () => {
	rollbackTest('deletes the category and clears it from the caller`s Tasks only', async (db) => {
		const mia = await seedUser(db);
		const sam = await seedUser(db);
		const category = await seedTaskCategory(db, mia.id, 'home');
		const owned = await seedTask(db, { title: 'Owned', category: 'home', userId: mia.id });
		const assigned = await seedTask(db, {
			title: 'Assigned',
			category: 'Home',
			assignedTo: mia.id,
			userId: sam.id
		});
		const theirs = await seedTask(db, { title: 'Theirs', category: 'home', userId: sam.id });

		await deleteCategoryWithTasks(db, {
			userId: mia.id,
			categoryId: category.id,
			name: 'home'
		});

		expect(await db.select().from(taskCategories)).toHaveLength(0);
		const rows = await db.select().from(tasks);
		expect(rows.find((row) => row.id === owned.id)?.category).toBeNull();
		expect(rows.find((row) => row.id === assigned.id)?.category).toBeNull();
		expect(rows.find((row) => row.id === theirs.id)?.category).toBe('home');
	});
});
