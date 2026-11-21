/**
 * tasks category repo: the per-user task category list and its propagation
 * into the caller's Tasks.
 *
 * Names are unique per user CASE-INSENSITIVELY (the `lower(name)` unique
 * index), so every lookup compares `lower(name)`, and an insert that loses a
 * race answers `null` (`onConflictDoNothing`) — the service re-reads. Rename
 * and delete touch the caller's Tasks inside one transaction: rows they own
 * OR are assigned to, matched on `lower(category)`.
 *
 * Writes take the caller's `now` (rule R5); `createdAt`/`updatedAt` are
 * `Date`s.
 *
 * Unordered read: `listCategories` has no ORDER BY, because the store has
 * none — the list's name order is the service's sort.
 *
 * Doc: ./README.md#invariants
 */
import { and, eq, or, sql } from 'drizzle-orm';
import type { Db } from '$lib/kernel/db/database.server';
import {
	taskCategories,
	type NewTaskCategoryRow,
	tasks,
	type TaskCategoryRow
} from '$lib/kernel/db/tables.server';

/** Every category of one user, in store order (the caller sorts). */
export async function listCategories(db: Db, userId: string): Promise<TaskCategoryRow[]> {
	return await db.select().from(taskCategories).where(eq(taskCategories.userId, userId));
}

/** One of the caller's categories by id — another user's id is `null`. */
export async function findCategoryById(
	db: Db,
	userId: string,
	id: string
): Promise<TaskCategoryRow | null> {
	const [row] = await db
		.select()
		.from(taskCategories)
		.where(and(eq(taskCategories.userId, userId), eq(taskCategories.id, id)));
	return row ?? null;
}

/** One of the caller's categories by name, case-insensitively. */
export async function findCategoryByName(
	db: Db,
	userId: string,
	name: string
): Promise<TaskCategoryRow | null> {
	const [row] = await db
		.select()
		.from(taskCategories)
		.where(
			and(
				eq(taskCategories.userId, userId),
				sql`lower(${taskCategories.name}) = lower(${name})`
			)
		);
	return row ?? null;
}

/**
 * Insert a category unless the caller already has that name in any case.
 * `null` when the unique index rejected the write (the caller re-reads the
 * winner).
 */
export async function insertCategoryIfAbsent(
	db: Db,
	values: { readonly userId: string; readonly name: string; readonly now: Date }
): Promise<TaskCategoryRow | null> {
	const row: NewTaskCategoryRow = {
		userId: values.userId,
		name: values.name,
		createdAt: values.now,
		updatedAt: values.now
	};
	const [created] = await db.insert(taskCategories).values(row).onConflictDoNothing().returning();
	return created ?? null;
}

/** True for a Postgres unique violation (raw or drizzle-wrapped). */
function isUniqueViolation(error: unknown): boolean {
	for (let e: unknown = error; e && typeof e === 'object'; e = 'cause' in e ? e.cause : undefined) {
		if ('code' in e && e.code === '23505') return true;
	}
	return false;
}

/** The caller's Tasks carrying a category name, case-insensitively. */
function callerTasksNamed(userId: string, name: string) {
	return and(
		or(eq(tasks.userId, userId), eq(tasks.assignedTo, userId)),
		sql`lower(${tasks.category}) = lower(${name})`
	);
}

/**
 * Rename one of the caller's categories and re-tag their Tasks in the same
 * transaction. `null` when the new name clashes with another of their
 * categories (the unique index names it `23505`).
 */
export async function renameCategoryWithTasks(
	db: Db,
	values: {
		readonly userId: string;
		readonly categoryId: string;
		readonly oldName: string;
		readonly newName: string;
		readonly now: Date;
	}
): Promise<TaskCategoryRow | null> {
	try {
		return await db.transaction(async (tx) => {
			const [row] = await tx
				.update(taskCategories)
				.set({ name: values.newName, updatedAt: values.now })
				.where(
					and(
						eq(taskCategories.userId, values.userId),
						eq(taskCategories.id, values.categoryId)
					)
				)
				.returning();
			await tx
				.update(tasks)
				.set({ category: values.newName })
				.where(callerTasksNamed(values.userId, values.oldName));
			return row ?? null;
		});
	} catch (error) {
		if (isUniqueViolation(error)) return null;
		throw error;
	}
}

/** Delete one of the caller's categories and clear it from their Tasks in one transaction. */
export async function deleteCategoryWithTasks(
	db: Db,
	values: { readonly userId: string; readonly categoryId: string; readonly name: string }
): Promise<void> {
	await db.transaction(async (tx) => {
		await tx
			.delete(taskCategories)
			.where(
				and(eq(taskCategories.userId, values.userId), eq(taskCategories.id, values.categoryId))
			);
		await tx.update(tasks).set({ category: null }).where(callerTasksNamed(values.userId, values.name));
	});
}
