import { db } from '$lib/server/db';
import { tasks, type Task } from '$lib/server/db/schema';
import { and, eq, or, desc, isNotNull } from 'drizzle-orm';

export async function createTask(data: {
	title: string;
	notes?: string | null;
	dueDate?: string | null;
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
	data: Partial<Pick<Task, 'title' | 'notes' | 'dueDate' | 'completedAt'>>
) {
	const [updated] = await db
		.update(tasks)
		.set(data)
		.where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
		.returning();
	return updated;
}

export async function toggleTaskComplete(id: string, userId: string): Promise<Task | undefined> {
	const [task] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
	if (!task) return undefined;
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
