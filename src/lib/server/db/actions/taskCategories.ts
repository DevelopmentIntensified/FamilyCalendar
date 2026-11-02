// Task categories (#280): per-user list of category NAMES shared with the
// TaskFocus desktop (its rule-sets stay desktop-side). A task carries one
// name (tasks.category); setting an unknown name auto-adds it here, and a
// rename/delete propagates to the caller's tasks (owned or assigned to them).

import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { taskCategories, tasks, type TaskCategory } from '$lib/server/db/schema';

export const MAX_CATEGORY_LENGTH = 80;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Task-field parser (POST/PUT /api/tasks `category`). Callers handle
 * `undefined` (= unchanged) themselves. null / blank -> null (uncategorized);
 * strings are trimmed and capped at 80 chars; anything else is rejected.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- exported boundary parser: unknown input IS its contract; routes feed it raw request-body fields.
export function parseTaskCategory(raw: unknown): ParseResult<string | null> {
	if (raw === null) return { ok: true, value: null };
	if (typeof raw !== 'string') return { ok: false, error: 'category must be a string' };
	const value = raw.trim();
	if (!value) return { ok: true, value: null };
	if (value.length > MAX_CATEGORY_LENGTH) return { ok: false, error: 'category is too long' };
	return { ok: true, value };
}

/** List-endpoint parser (`name` on POST/PATCH /api/task-categories). */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- exported boundary parser: unknown input IS its contract; routes feed it raw request-body fields.
export function parseCategoryName(raw: unknown): ParseResult<string> {
	const value = typeof raw === 'string' ? raw.trim() : '';
	if (!value) return { ok: false, error: 'name is required' };
	if (value.length > MAX_CATEGORY_LENGTH) return { ok: false, error: 'name is too long' };
	return { ok: true, value };
}

/** Wire shape: `{id, name, createdAt, updatedAt}` (no userId). */
export type TaskCategoryDto = Pick<TaskCategory, 'id' | 'name' | 'createdAt' | 'updatedAt'>;

export function toCategoryDto(row: TaskCategory): TaskCategoryDto {
	return { id: row.id, name: row.name, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

/**
 * DB seam. Names compare case-insensitively per user. `insert` and
 * `renameWithTasks` return undefined when the (user, lower(name)) unique
 * index rejects the write. Propagation scope for rename/delete = tasks
 * owned by OR assigned to `userId` whose category matches the old name
 * case-insensitively.
 */
export type TaskCategoryStore = {
	list(userId: string): Promise<TaskCategory[]>;
	findById(userId: string, id: string): Promise<TaskCategory | undefined>;
	findByName(userId: string, name: string): Promise<TaskCategory | undefined>;
	insert(userId: string, name: string): Promise<TaskCategory | undefined>;
	renameWithTasks(
		userId: string,
		category: TaskCategory,
		name: string
	): Promise<TaskCategory | undefined>;
	deleteWithTasks(userId: string, category: TaskCategory): Promise<void>;
};

/** True for a Postgres unique violation (raw or drizzle-wrapped). */
function isUniqueViolation(err: unknown): boolean {
	for (let e: unknown = err; e && typeof e === 'object'; e = 'cause' in e ? e.cause : undefined) {
		if ('code' in e && e.code === '23505') return true;
	}
	return false;
}

function callerTasksNamed(userId: string, name: string) {
	return and(
		or(eq(tasks.userId, userId), eq(tasks.assignedTo, userId)),
		sql`lower(${tasks.category}) = lower(${name})`
	);
}

export const drizzleTaskCategoryStore: TaskCategoryStore = {
	list: (userId) => db.select().from(taskCategories).where(eq(taskCategories.userId, userId)),
	findById: async (userId, id) => {
		const [row] = await db
			.select()
			.from(taskCategories)
			.where(and(eq(taskCategories.userId, userId), eq(taskCategories.id, id)));
		return row;
	},
	findByName: async (userId, name) => {
		const [row] = await db
			.select()
			.from(taskCategories)
			.where(
				and(eq(taskCategories.userId, userId), sql`lower(${taskCategories.name}) = lower(${name})`)
			);
		return row;
	},
	insert: async (userId, name) => {
		const [row] = await db
			.insert(taskCategories)
			.values({ userId, name })
			.onConflictDoNothing()
			.returning();
		return row;
	},
	renameWithTasks: async (userId, category, name) => {
		try {
			return await db.transaction(async (tx) => {
				const [row] = await tx
					.update(taskCategories)
					.set({ name, updatedAt: new Date() })
					.where(and(eq(taskCategories.userId, userId), eq(taskCategories.id, category.id)))
					.returning();
				await tx
					.update(tasks)
					.set({ category: name })
					.where(callerTasksNamed(userId, category.name));
				return row;
			});
		} catch (err) {
			if (isUniqueViolation(err)) return undefined;
			throw err;
		}
	},
	deleteWithTasks: async (userId, category) => {
		await db.transaction(async (tx) => {
			await tx
				.delete(taskCategories)
				.where(and(eq(taskCategories.userId, userId), eq(taskCategories.id, category.id)));
			await tx.update(tasks).set({ category: null }).where(callerTasksNamed(userId, category.name));
		});
	}
};

/** The caller's categories, name-sorted (case-insensitive). */
export async function listTaskCategories(
	userId: string,
	store: TaskCategoryStore = drizzleTaskCategoryStore
): Promise<TaskCategory[]> {
	const rows = await store.list(userId);
	return [...rows].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/**
 * Page-loader read for the web editor (#280): the viewer's list as
 * `{id, name}`. Never throws — a failed read (e.g. 024 not applied yet)
 * logs and yields [] so the tasks pages still render; the combobox then just
 * has no suggestions.
 */
export async function listCategoryOptions(
	userId: string,
	store: TaskCategoryStore = drizzleTaskCategoryStore
): Promise<{ id: string; name: string }[]> {
	try {
		const rows = await listTaskCategories(userId, store);
		return rows.map(({ id, name }) => ({ id, name }));
	} catch (e) {
		console.error(
			'[task-categories] list failed',
			JSON.stringify({ userId, error: e instanceof Error ? e.message : String(e) })
		);
		return [];
	}
}

/**
 * Idempotent add: a case-insensitive existing name returns the existing row
 * (its stored spelling is canonical). Used by POST /api/task-categories and
 * the auto-add when a task's category is set. A lost insert race re-reads.
 */
export async function ensureTaskCategory(
	userId: string,
	name: string,
	store: TaskCategoryStore = drizzleTaskCategoryStore
): Promise<TaskCategory> {
	const existing = await store.findByName(userId, name);
	if (existing) return existing;
	const inserted = await store.insert(userId, name);
	if (inserted) return inserted;
	const winner = await store.findByName(userId, name);
	if (!winner) throw new Error('task category insert conflicted but no row found');
	return winner;
}

export type RenameResult =
	| { status: 'ok'; category: TaskCategory }
	| { status: 'not_found' }
	| { status: 'conflict' };

/** Rename one of the caller's categories and retag their tasks. */
export async function renameTaskCategory(
	userId: string,
	id: string,
	name: string,
	store: TaskCategoryStore = drizzleTaskCategoryStore
): Promise<RenameResult> {
	const category = await store.findById(userId, id);
	if (!category) return { status: 'not_found' };
	const clash = await store.findByName(userId, name);
	if (clash && clash.id !== category.id) return { status: 'conflict' };
	const renamed = await store.renameWithTasks(userId, category, name);
	return renamed ? { status: 'ok', category: renamed } : { status: 'conflict' };
}

/** Delete one of the caller's categories; their tasks carrying it -> null. */
export async function deleteTaskCategory(
	userId: string,
	id: string,
	store: TaskCategoryStore = drizzleTaskCategoryStore
): Promise<boolean> {
	const category = await store.findById(userId, id);
	if (!category) return false;
	await store.deleteWithTasks(userId, category);
	return true;
}
