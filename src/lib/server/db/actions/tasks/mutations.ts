// Task mutations (issue #113): create/update/delete plus the shared
// toggle decision (recurring roll vs plain complete).

import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { taskCompletions, taskTags, tasks, type Task } from '$lib/server/db/schema';
import { canMutateTask } from './auth';
import { advanceRecurringTask } from './cursor';
import { attachTags, normalizeTags } from './tags';
import { normalizeTaskVisibility, type TaskWithTags } from './types';


export async function createTask(data: {
	title: string;
	notes?: string | null;
	dueDate?: string | null;
	recurrenceFrequency?: string | null;
	recurrenceInterval?: number | null;
	assignedTo?: string | null;
	assignmentStatus?: string | null;
	priority?: string | null;
	visibility?: string | null;
	tags?: string[] | null;
	userId: string;
	familyId?: string | null;
	eventId?: string | null;
}): Promise<TaskWithTags> {
	const tags = normalizeTags(data.tags);
	const created = await db.transaction(async (tx) => {
		const [row] = await tx
			.insert(tasks)
			.values({
				title: data.title,
				notes: data.notes ?? null,
				dueDate: data.dueDate ?? null,
				recurrenceFrequency: data.recurrenceFrequency ?? null,
				recurrenceInterval: data.recurrenceInterval ?? null,
				assignedTo: data.assignedTo ?? null,
				assignmentStatus: data.assignmentStatus ?? 'none',
				priority: data.priority ?? 'normal',
				visibility: normalizeTaskVisibility(data.visibility),
				userId: data.userId,
				familyId: data.familyId ?? null,
				eventId: data.eventId ?? null
			})
			.returning();
		if (tags.length > 0) {
			await tx.insert(taskTags).values(tags.map((name) => ({ taskId: row.id, name })));
		}
		return row;
	});
	return { ...created, tags };
}
export async function updateTask(
	id: string,
	userId: string,
	data: Partial<
		Pick<
			Task,
			| 'title'
			| 'notes'
			| 'dueDate'
			| 'completedAt'
			| 'recurrenceFrequency'
			| 'recurrenceInterval'
			| 'assignedTo'
			| 'assignmentStatus'
			| 'priority'
			| 'visibility'
		>
	> & { tags?: string[] | null }
): Promise<TaskWithTags | undefined> {
	const hasTags = data.tags !== undefined;
	const patch = Object.fromEntries(
		Object.entries(data).filter(([k, v]) => k !== 'tags' && v !== undefined)
	);
	if (Object.keys(patch).length === 0 && !hasTags) {
		const [existing] = await db
			.select()
			.from(tasks)
			.where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
		if (!existing) return undefined;
		return { ...existing, tags: (await attachTags([existing])).get(existing.id) ?? [] };
	}
	return db.transaction(async (tx) => {
		let row: Task | undefined;
		if (Object.keys(patch).length > 0) {
			const [updated] = await tx
				.update(tasks)
				.set(patch)
				.where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
				.returning();
			row = updated;
		} else {
			const [existing] = await tx
				.select()
				.from(tasks)
				.where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
			row = existing;
		}
		if (!row) return undefined;
		const tags = normalizeTags(hasTags ? data.tags : ((await attachTags([row])).get(row.id) ?? []));
		if (hasTags) {
			await tx.delete(taskTags).where(eq(taskTags.taskId, row.id));
			if (tags.length > 0) {
				await tx.insert(taskTags).values(tags.map((name) => ({ taskId: row.id, name })));
			}
		}
		return { ...row, tags };
	});
}

/**
 * Shared recurring-vs-oneoff toggle decision: completing an OPEN recurring
 * task rolls the cursor onto the next occurrence instead of closing it out;
 * everything else is a plain complete/un-complete toggle.
 */
export async function applyToggle(
	task: Task,
	zone?: string,
	actorId?: string
): Promise<Task | undefined> {
	if (!task.completedAt && task.recurrenceFrequency) {
		return advanceRecurringTask(task, zone, actorId);
	}
	return toggleCompletion(task, actorId);
}

/**
 * Double-click protection: only complete when still open, only
 * un-complete when still completed.
 */
async function toggleCompletion(task: Task, actorId?: string): Promise<Task> {
	const id = task.id;
	const completing = !task.completedAt;
	const guard = [eq(tasks.id, id)];
	if (completing) guard.push(isNull(tasks.completedAt));
	else if (task.completedAt !== null) guard.push(eq(tasks.completedAt, task.completedAt));
	const [updated] = await db
		.update(tasks)
		.set({ completedAt: completing ? new Date().toISOString() : null })
		.where(and(...guard))
		.returning();
	if (updated) {
		// History is append-only: record completions only, never
		// un-completions. If the task is un-completed later, the row
		// stays — history records that it happened.
		if (completing) {
			await db.insert(taskCompletions).values({
				taskId: updated.id,
				userId: updated.userId,
				actorId: actorId ?? null,
				familyId: updated.familyId ?? null
			});
		}
		return updated;
	}
	const [fresh] = await db.select().from(tasks).where(eq(tasks.id, id));
	return fresh;
}

export async function toggleTaskComplete(
	id: string,
	userId: string,
	zone?: string
): Promise<Task | undefined> {
	// The owner, the assignee, or any member of the task's family may toggle.
	const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
	if (!task) return undefined;
	if (!(await canMutateTask(task, userId))) return undefined;

	// userId is the authenticated caller — recorded as the completion actor.
	return applyToggle(task, zone, userId);
}

/**
 * Deletes (or archives, when completed) a task under the same issue-019
 * rules as every other mutation: the owner, a live assignee on a personal
 * task, or any member of a family task. External API clients (Bearer-token
 * todo apps) rely on this for delete syncs — an unauthorized caller gets
 * `false`, which the route turns into 404 (not a silent success).
 *
 * Completed tasks back the stats/streak history, so removing one archives
 * it instead of deleting. Open tasks have no stats attached — hard delete.
 * Returns true when the row was deleted/archived, false when missing or
 * not permitted.
 */
export async function deleteTask(id: string, userId: string): Promise<boolean> {
	const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
	if (!task) return false;
	if (!(await canMutateTask(task, userId))) return false;

	if (task.completedAt) {
		await db.update(tasks).set({ archivedAt: new Date().toISOString() }).where(eq(tasks.id, id));
	} else {
		await db.delete(tasks).where(eq(tasks.id, id));
	}
	return true;
}

/** Archive completed tasks instead of deleting them: the rows power the stats
 *  page (completedOnce, recentlyCompleted) and the weekly streak via
 *  `taskCompletions` history, so a "clear completed" must not erase stats. */
export async function deleteCompletedTasks(userId: string) {
	await db
		.update(tasks)
		.set({ archivedAt: new Date().toISOString() })
		.where(and(eq(tasks.userId, userId), isNotNull(tasks.completedAt), isNull(tasks.archivedAt)));
}

/** Family members may toggle any task inside their family. */
export async function toggleTaskCompleteFamily(
	id: string,
	familyId: string,
	userId: string,
	zone?: string
): Promise<Task | undefined> {
	const [task] = await db
		.select()
		.from(tasks)
		.where(and(eq(tasks.id, id), eq(tasks.familyId, familyId)));
	if (!task) return undefined;
	if (!(await canMutateTask(task, userId))) return undefined;

	// userId is the authenticated caller — recorded as the completion actor.
	return applyToggle(task, zone, userId);
}
