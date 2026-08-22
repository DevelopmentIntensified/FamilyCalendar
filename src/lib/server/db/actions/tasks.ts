import { db } from '$lib/server/db';
import { tasks, events, type Task } from '$lib/server/db/schema';
import { and, eq, or, desc, isNotNull } from 'drizzle-orm';
import { DateTime } from 'luxon';

export const TASK_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type TaskFrequency = (typeof TASK_FREQUENCIES)[number];

/**
 * Recurring Task cursor: completing a recurring task materializes its
 * next due date instead of marking it done. Anchored on the current
 * due date so an overdue "every 3 days" chore stays on its cadence.
 */
export function nextDueDate(dueIso: string | null, frequency: string, interval: number): string {
	const base = dueIso ? DateTime.fromISO(dueIso) : DateTime.now();
	const step = Math.max(1, Math.floor(interval) || 1);
	let next: DateTime;
	switch (frequency) {
		case 'daily':
			next = base.plus({ days: step });
			break;
		case 'weekly':
			next = base.plus({ weeks: step });
			break;
		case 'monthly':
			next = base.plus({ months: step });
			break;
		case 'yearly':
			next = base.plus({ years: step });
			break;
		default:
			next = base.plus({ days: step });
	}
	return next.toISO()!;
}

export async function createTask(data: {
	title: string;
	notes?: string | null;
	dueDate?: string | null;
	recurrenceFrequency?: string | null;
	recurrenceInterval?: number | null;
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
			userId: tasks.userId,
			familyId: tasks.familyId,
			eventId: tasks.eventId,
			createdAt: tasks.createdAt,
			eventTitle: events.title,
			eventStart: events.start
		})
		.from(tasks)
		.leftJoin(events, eq(tasks.eventId, events.id))
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
			'title' | 'notes' | 'dueDate' | 'completedAt' | 'recurrenceFrequency' | 'recurrenceInterval'
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

	// Completing a Recurring Task rolls the due-date cursor forward
	// instead of closing it out.
	if (!task.completedAt && task.recurrenceFrequency) {
		const next = nextDueDate(
			task.dueDate,
			task.recurrenceFrequency,
			task.recurrenceInterval ?? 1
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
