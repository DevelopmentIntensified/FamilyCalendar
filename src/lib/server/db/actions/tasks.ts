import { db } from '$lib/server/db';
import { tasks, events, users, type Task } from '$lib/server/db/schema';
import { and, eq, or, desc, isNotNull, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DateTime } from 'luxon';

const assignee = alias(users, 'assignee');

export const TASK_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type TaskFrequency = (typeof TASK_FREQUENCIES)[number];

/**
 * Recurring Task cursor v2. Exactly one live occurrence exists at a
 * time. Completing snaps the next one onto the schedule anchored at
 * max(due, today) — early checks keep the Friday slot, late/pinned
 * ones slide from today.
 */
export function advanceCursor(
	dueIso: string | null,
	frequency: string,
	interval: number,
	nowIso: string
): string {
	const step = Math.max(1, Math.floor(interval) || 1);
	const now = DateTime.fromISO(nowIso).startOf('day');
	let anchor = dueIso ? DateTime.fromISO(dueIso) : now;
	if (!anchor.isValid || anchor < now) anchor = now;
	let next: DateTime;
	switch (frequency) {
		case 'weekly':
			next = anchor.plus({ weeks: step });
			break;
		case 'monthly':
			next = anchor.plus({ months: step });
			break;
		case 'yearly':
			next = anchor.plus({ years: step });
			break;
		case 'daily':
		default:
			next = anchor.plus({ days: step });
	}
	return next.toISO()!;
}

/** One overdue recurring row: does it need pinning to today? */
export function needsOverduePin(dueIso: string | null, nowIso: string): boolean {
	if (!dueIso) return false;
	const due = DateTime.fromISO(dueIso);
	const todayStart = DateTime.fromISO(nowIso).startOf('day');
	return due.isValid && due < todayStart;
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
		.where(or(...conditions))
		.orderBy(desc(tasks.createdAt));
}

export async function getTasksForEvent(eventId: string) {
	return await db.select().from(tasks).where(eq(tasks.eventId, eventId)).orderBy(tasks.createdAt);
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

export async function toggleTaskComplete(id: string, userId: string): Promise<Task | undefined> {
	const [task] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
	if (!task) return undefined;

	// Completing a Recurring Task rolls the cursor onto the next
	// scheduled occurrence instead of closing it out.
	if (!task.completedAt && task.recurrenceFrequency) {
		const next = advanceCursor(
			task.dueDate,
			task.recurrenceFrequency,
			task.recurrenceInterval ?? 1,
			new Date().toISOString()
		);
		const [advanced] = await db
			.update(tasks)
			.set({ dueDate: next })
			.where(eq(tasks.id, id))
			.returning();
		return advanced;
	}

	const [updated] = await db
		.update(tasks)
		.set({ completedAt: task.completedAt ? null : new Date().toISOString() })
		.where(eq(tasks.id, id))
		.returning();
	return updated;
}

export async function deleteTask(id: string, userId: string) {
	await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
}

export async function deleteCompletedTasks(userId: string) {
	await db
		.delete(tasks)
		.where(and(eq(tasks.userId, userId), isNotNull(tasks.completedAt)));
}

/**
 * Overdue Recurring Tasks stick to today: their due date follows the
 * current date until dismissed. Piggybacked on task/calendar loads.
 */
export async function syncRecurringCursors(userId: string, familyId?: string | null) {
	const nowIso = new Date().toISOString();
	const todayEnd = DateTime.fromISO(nowIso).set({ hour: 23, minute: 59, second: 0, millisecond: 0 }).toISO()!;

	const conditions = [
		eq(tasks.userId, userId),
		isNotNull(tasks.recurrenceFrequency),
		isNull(tasks.completedAt),
		isNotNull(tasks.dueDate)
	];
	if (familyId) conditions.push(eq(tasks.familyId, familyId));

	const stale = (await db
		.select({ id: tasks.id, dueDate: tasks.dueDate })
		.from(tasks)
		.where(and(...conditions)))
		.filter((t) => needsOverduePin(t.dueDate, nowIso));

	for (const row of stale) {
		await db.update(tasks).set({ dueDate: todayEnd }).where(eq(tasks.id, row.id));
	}
}
