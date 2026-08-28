import { db } from '$lib/server/db';
import { tasks, events, users, taskCompletions, type Task } from '$lib/server/db/schema';
import { and, eq, or, desc, isNotNull, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DateTime } from 'luxon';
import { zonedNow } from '$lib/server/utils/userTimezone';
import { toDateTime } from '$lib/server/utils/eventTimes';

const assignee = alias(users, 'assignee');
const creator = alias(users, 'creator');

export const TASK_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type TaskFrequency = (typeof TASK_FREQUENCIES)[number];

/**
 * Recurring Task cursor v3. Exactly one live occurrence exists at a
 * time. Completing snaps the next one to today + n*interval, where n
 * is the smallest multiple that lands strictly past the current due
 * date (early checks advance; if the due date already sits one
 * interval out, the next check takes two intervals, and so on).
 */
function plusInterval(dt: DateTime, frequency: string, step: number): DateTime {
	switch (frequency) {
		case 'weekly':
			return dt.plus({ weeks: step });
		case 'monthly':
			return dt.plus({ months: step });
		case 'yearly':
			return dt.plus({ years: step });
		default:
			return dt.plus({ days: step });
	}
}

export function advanceCursor(
	dueIso: string | null,
	frequency: string,
	interval: number,
	nowIso: string
): string {
	const step = Math.max(1, Math.floor(interval) || 1);
	// postgres.js can return Date objects despite mode:'string', so
	// normalize through toDateTime before comparing.
	const now = (toDateTime(nowIso) ?? DateTime.fromISO(nowIso)).startOf('day');
	const due = dueIso !== null ? toDateTime(dueIso) : null;

	let n = 1;
	let next = plusInterval(now, frequency, step);
	while (due && next <= due && n < 1000) {
		n += 1;
		next = plusInterval(now, frequency, step * n);
	}
	return next.toISO()!;
}

/** One overdue recurring row: does it need pinning to today? */
export function needsOverduePin(dueIso: string | null, nowIso: string): boolean {
	// toDateTime handles Date objects and odd string shapes from the driver.
	const due = toDateTime(dueIso);
	if (!due) return false;
	const todayStart = (toDateTime(nowIso) ?? DateTime.fromISO(nowIso)).startOf('day');
	return due < todayStart;
}

export async function createTask(data: {
	title: string;
	notes?: string | null;
	dueDate?: string | null;
	recurrenceFrequency?: string | null;
	recurrenceInterval?: number | null;
	assignedTo?: string | null;
	assignmentStatus?: string | null;
	userId: string;
	familyId?: string | null;
	eventId?: string | null;
}): Promise<Task> {
	const [created] = await db
		.insert(tasks)
		.values({
			title: data.title,
			notes: data.notes ?? null,
			dueDate: data.dueDate ?? null,
			recurrenceFrequency: data.recurrenceFrequency ?? null,
			recurrenceInterval: data.recurrenceInterval ?? null,
			assignedTo: data.assignedTo ?? null,
			assignmentStatus: data.assignmentStatus ?? 'none',
			userId: data.userId,
			familyId: data.familyId ?? null,
			eventId: data.eventId ?? null
		})
		.returning();
	return created;
}

/** Personal tasks + family tasks + tasks attached to the given events,
 *  with the parent event's title/start so lists can attribute them. */
export async function getTasksForUser(userId: string, familyId?: string | null) {
	const conditions = [eq(tasks.userId, userId)];
	if (familyId) {
		conditions.push(eq(tasks.familyId, familyId));
	}
	return await db
		.select({
			id: tasks.id,
			title: tasks.title,
			notes: tasks.notes,
			dueDate: tasks.dueDate,
			completedAt: tasks.completedAt,
			recurrenceFrequency: tasks.recurrenceFrequency,
			recurrenceInterval: tasks.recurrenceInterval,
			completionCount: tasks.completionCount,
			assignedTo: tasks.assignedTo,
			assignmentStatus: tasks.assignmentStatus,
			assigneeFirstName: assignee.firstName,
			assigneeLastName: assignee.lastName,
			userId: tasks.userId,
			familyId: tasks.familyId,
			eventId: tasks.eventId,
			createdAt: tasks.createdAt,
			eventTitle: events.title,
			eventStart: events.start
		})
		.from(tasks)
		.leftJoin(events, eq(tasks.eventId, events.id))
		.leftJoin(assignee, eq(tasks.assignedTo, assignee.id))
		.where(and(or(...conditions), isNull(tasks.archivedAt)))
		.orderBy(desc(tasks.createdAt));
}

export async function getTasksForEvent(eventId: string) {
	return await db
		.select()
		.from(tasks)
		.where(and(eq(tasks.eventId, eventId), isNull(tasks.archivedAt)))
		.orderBy(tasks.createdAt);
}

/** Every task in a family, with assignee and creator attribution. */
export async function getTasksForFamily(familyId: string) {
	return await db
		.select({
			id: tasks.id,
			title: tasks.title,
			notes: tasks.notes,
			dueDate: tasks.dueDate,
			completedAt: tasks.completedAt,
			recurrenceFrequency: tasks.recurrenceFrequency,
			recurrenceInterval: tasks.recurrenceInterval,
			completionCount: tasks.completionCount,
			assignedTo: tasks.assignedTo,
			assignmentStatus: tasks.assignmentStatus,
			assigneeFirstName: assignee.firstName,
			assigneeLastName: assignee.lastName,
			userId: tasks.userId,
			familyId: tasks.familyId,
			eventId: tasks.eventId,
			createdAt: tasks.createdAt,
			eventTitle: events.title,
			eventStart: events.start,
			creatorFirstName: creator.firstName
		})
		.from(tasks)
		.leftJoin(events, eq(tasks.eventId, events.id))
		.leftJoin(assignee, eq(tasks.assignedTo, assignee.id))
		.leftJoin(creator, eq(tasks.userId, creator.id))
		.where(and(eq(tasks.familyId, familyId), isNull(tasks.archivedAt)))
		.orderBy(desc(tasks.createdAt));
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
		>
	>
) {
	const patch = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
	if (Object.keys(patch).length === 0) {
		const [existing] = await db
			.select()
			.from(tasks)
			.where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
		return existing;
	}
	const [updated] = await db
		.update(tasks)
		.set(patch)
		.where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
		.returning();
	return updated;
}

/**
 * Completing a Recurring Task rolls the cursor onto the next
 * scheduled occurrence instead of closing it out.
 */
async function advanceRecurringTask(task: Task, zone?: string): Promise<Task | undefined> {
	if (!task.completedAt || !task.recurrenceFrequency) return undefined;
	const nowIso = zone ? zonedNow(zone).toISO()! : new Date().toISOString();
	const next = advanceCursor(
		task.dueDate,
		task.recurrenceFrequency,
		task.recurrenceInterval ?? 1,
		nowIso
	);
	// Optimistic guard: a second rapid click must not advance the
	// cursor again or lose the completionCount increment.
	const guard = [eq(tasks.id, task.id)];
	if (task.dueDate !== null) guard.push(eq(tasks.dueDate, task.dueDate));
	const [advanced] = await db
		.update(tasks)
		.set({ dueDate: next, completionCount: sql`${tasks.completionCount} + 1` })
		.where(and(...guard))
		.returning();
	if (advanced) {
		// History row for the check-off; only written when the guarded
		// update actually matched (double-clicks insert nothing).
		await db.insert(taskCompletions).values({
			taskId: advanced.id,
			userId: advanced.userId,
			familyId: advanced.familyId ?? null
		});
		return advanced;
	}
	const [fresh] = await db.select().from(tasks).where(eq(tasks.id, task.id));
	return fresh;
}

/**
 * Double-click protection: only complete when still open, only
 * un-complete when still completed.
 */
async function toggleCompletion(task: Task): Promise<Task> {
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
	// The assignee can check off their own task; the creator always can.
	const [task] = await db
		.select()
		.from(tasks)
		.where(and(eq(tasks.id, id), or(eq(tasks.userId, userId), eq(tasks.assignedTo, userId))));
	if (!task) return undefined;

	// Completing a Recurring Task rolls the cursor onto the next
	// scheduled occurrence instead of closing it out.
	if (!task.completedAt && task.recurrenceFrequency) {
		return advanceRecurringTask(task, zone);
	}
	return toggleCompletion(task);
}

export async function deleteTask(id: string, userId: string) {
	const [task] = await db
		.select({ completedAt: tasks.completedAt })
		.from(tasks)
		.where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
	if (!task) return;

	// Completed tasks back the stats/streak history, so removing one archives
	// it instead of deleting. Open tasks have no stats attached — hard delete.
	if (task.completedAt) {
		await db
			.update(tasks)
			.set({ archivedAt: new Date().toISOString() })
			.where(eq(tasks.id, id));
	} else {
		await db.delete(tasks).where(eq(tasks.id, id));
	}
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
	zone?: string
): Promise<Task | undefined> {
	const [task] = await db
		.select()
		.from(tasks)
		.where(and(eq(tasks.id, id), eq(tasks.familyId, familyId)));
	if (!task) return undefined;

	if (!task.completedAt && task.recurrenceFrequency) {
		return advanceRecurringTask(task, zone);
	}
	return toggleCompletion(task);
}

/** Family-scoped assignment responses (accept/decline/release). */
export async function updateTaskInFamily(
	id: string,
	familyId: string,
	data: Partial<Pick<Task, 'assignmentStatus' | 'assignedTo'>>
) {
	const patch = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
	if (Object.keys(patch).length === 0) return undefined;
	const [updated] = await db
		.update(tasks)
		.set(patch)
		.where(and(eq(tasks.id, id), eq(tasks.familyId, familyId)))
		.returning();
	return updated;
}

/**
 * Overdue Recurring Tasks stick to today: their due date follows the
 * current date until dismissed. Piggybacked on task/calendar loads.
 */
export async function syncRecurringCursors(userId: string, familyId?: string | null, zone?: string) {
	const nowIso = zone ? zonedNow(zone).toISO()! : new Date().toISOString();
	const todayEnd = DateTime.fromISO(nowIso)
		.set({ hour: 23, minute: 59, second: 0, millisecond: 0 })
		.toISO()!;

	const conditions = [
		eq(tasks.userId, userId),
		isNotNull(tasks.recurrenceFrequency),
		isNull(tasks.completedAt),
		isNull(tasks.archivedAt),
		isNotNull(tasks.dueDate)
	];
	if (familyId) conditions.push(eq(tasks.familyId, familyId));

	const stale = (
		await db
			.select({ id: tasks.id, dueDate: tasks.dueDate })
			.from(tasks)
			.where(and(...conditions))
	).filter((t) => needsOverduePin(t.dueDate, nowIso));

	for (const row of stale) {
		await db.update(tasks).set({ dueDate: todayEnd }).where(eq(tasks.id, row.id));
	}
}
