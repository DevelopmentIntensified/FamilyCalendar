/**
 * tasks category service: the per-user Task category list — read, idempotent
 * add, rename-with-propagation, delete-with-clear — and the internal
 * `ensureTaskCategory` the Task create/update paths call when a `category`
 * field names a label.
 *
 * Names are unique per user CASE-INSENSITIVELY (the `lower(name)` unique
 * index), so every comparison goes through the repo's `lower(name)` finds; an
 * insert that loses a race re-reads the winner. Rename and delete propagate to
 * the caller's Tasks — rows they own OR are assigned to — inside one
 * transaction, and a foreign or unknown id is the same `Category not found`.
 *
 * Wire shapes: the row without `userId`, with `createdAt`/`updatedAt` as ISO
 * instants (both columns are `mode:'date'`).
 *
 * Doc: ./README.md#invariants
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import type { TaskCategoryRow } from '$lib/kernel/db/tables.server';
import { conflict, notFound } from '$lib/kernel/errors/appError';
import {
	deleteCategoryWithTasks,
	findCategoryById,
	findCategoryByName,
	insertCategoryIfAbsent,
	listCategories,
	renameCategoryWithTasks
} from './tasks.category.repo.server';
import {
	TASK_CATEGORY_NAME_TAKEN,
	TASK_CATEGORY_NOT_FOUND,
	type TaskCategoryWire
} from './tasks.contract';

/** One stored category as the wire carries it (no `userId`; both stamps ISO). */
export function toTaskCategoryWire(row: TaskCategoryRow): TaskCategoryWire {
	return {
		id: row.id,
		name: row.name,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString()
	};
}

/** The caller's categories, name-sorted case-insensitively (the legacy order). */
export async function listTaskCategories(ctx: Ctx, actor: Actor): Promise<TaskCategoryWire[]> {
	const rows = await listCategories(ctx.db, actor.id);
	return [...rows]
		.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
		.map(toTaskCategoryWire);
}

/**
 * Idempotent add: a case-insensitive existing name answers that row, so the
 * LIST'S SPELLING is canonical for any variant a client sends. A lost insert
 * race re-reads the winner.
 *
 * Module-internal export: the Task create/update `category` field calls it to
 * auto-add an unknown name, exactly as legacy `ensureTaskCategory` did.
 */
export async function ensureTaskCategory(
	ctx: Ctx,
	actor: Actor,
	name: string
): Promise<TaskCategoryRow> {
	const existing = await findCategoryByName(ctx.db, actor.id, name);
	if (existing) return existing;
	const inserted = await insertCategoryIfAbsent(ctx.db, {
		userId: actor.id,
		name,
		now: ctx.clock.now()
	});
	if (inserted) return inserted;
	const winner = await findCategoryByName(ctx.db, actor.id, name);
	if (!winner) throw new Error('ensureTaskCategory: insert conflicted but no row found');
	return winner;
}

/** The list endpoint's add: ensure, then answer the stored row. */
export async function addTaskCategory(
	ctx: Ctx,
	actor: Actor,
	input: { readonly name: string }
): Promise<TaskCategoryWire> {
	return toTaskCategoryWire(await ensureTaskCategory(ctx, actor, input.name));
}

/**
 * Rename one of the caller's categories and re-tag their Tasks (owned or
 * assigned) in one transaction. A name another of their categories already
 * carries is a 409; an unknown or foreign id is a 404.
 */
export async function renameTaskCategory(
	ctx: Ctx,
	actor: Actor,
	input: { readonly categoryId: string; readonly name: string }
): Promise<TaskCategoryWire> {
	const category = await findCategoryById(ctx.db, actor.id, input.categoryId);
	if (!category) throw notFound(TASK_CATEGORY_NOT_FOUND);
	const clash = await findCategoryByName(ctx.db, actor.id, input.name);
	if (clash && clash.id !== category.id) throw conflict(TASK_CATEGORY_NAME_TAKEN);

	const renamed = await renameCategoryWithTasks(ctx.db, {
		userId: actor.id,
		categoryId: category.id,
		oldName: category.name,
		newName: input.name,
		now: ctx.clock.now()
	});
	if (!renamed) throw conflict(TASK_CATEGORY_NAME_TAKEN);
	return toTaskCategoryWire(renamed);
}

/**
 * Delete one of the caller's categories; every Task they own or are assigned
 * to that carries the name becomes uncategorized, in the same transaction.
 */
export async function removeTaskCategory(
	ctx: Ctx,
	actor: Actor,
	input: { readonly categoryId: string }
): Promise<void> {
	const category = await findCategoryById(ctx.db, actor.id, input.categoryId);
	if (!category) throw notFound(TASK_CATEGORY_NOT_FOUND);
	await deleteCategoryWithTasks(ctx.db, {
		userId: actor.id,
		categoryId: category.id,
		name: category.name
	});
}
