import { db } from '$lib/server/db';
import { tasks, users } from '$lib/server/db/schema';
import { and, count, desc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

const creator = alias(users, 'creator');
const assignee = alias(users, 'assignee');

/** Postgres returns timestamptz as 'YYYY-MM-DD HH:mm:ss+00'; the client renders
 *  these with DateTime.fromISO, which needs the 'T' separator. Normalize to ISO
 *  (and never hand back an unparseable value). */
export function toIsoTimestamp(value: string | null): string {
	if (!value) return '';
	const date = new Date(value);
	return isNaN(date.getTime()) ? '' : date.toISOString();
}

export interface TaskStats {
	completedOnce: number;
	recurringTasks: number;
	recurringCompletions: number;
	topAssigners: { name: string; total: number }[];
	topAssignees: { name: string; total: number }[];
	recentlyCompleted: { title: string; completedAt: string; recurring: boolean }[];
}

/** Aggregate task stats for a user: completions, recurring load,
 *  who assigns them the most and who they assign the most. */
export async function getTaskStats(userId: string): Promise<TaskStats> {
	const [completed] = await db
		.select({ total: count() })
		.from(tasks)
		.where(and(eq(tasks.userId, userId), isNotNull(tasks.completedAt)));

	const [recurringAgg] = await db
		.select({
			total: count(),
			completions: sql<number>`coalesce(sum(${tasks.completionCount}), 0)::int`
		})
		.from(tasks)
		.where(and(eq(tasks.userId, userId), isNotNull(tasks.recurrenceFrequency)));

	// Who has assigned THIS user the most tasks.
	const assignerRows = await db
		.select({ name: sql<string>`${creator.firstName} || ' ' || ${creator.lastName}`, total: count() })
		.from(tasks)
		.innerJoin(creator, eq(tasks.userId, creator.id))
		.where(and(eq(tasks.assignedTo, userId), ne(tasks.userId, userId)))
		.groupBy(creator.id, creator.firstName, creator.lastName)
		.orderBy(desc(count()))
		.limit(5);

	// Who this user assigns the most tasks TO.
	const assigneeRows = await db
		.select({ name: sql<string>`${assignee.firstName} || ' ' || ${assignee.lastName}`, total: count() })
		.from(tasks)
		.innerJoin(assignee, eq(tasks.assignedTo, assignee.id))
		.where(and(eq(tasks.userId, userId), ne(tasks.assignedTo, userId)))
		.groupBy(assignee.id, assignee.firstName, assignee.lastName)
		.orderBy(desc(count()))
		.limit(5);

	const recentRows = await db
		.select({
			title: tasks.title,
			completedAt: tasks.completedAt,
			recurrenceFrequency: tasks.recurrenceFrequency,
			completionCount: tasks.completionCount
		})
		.from(tasks)
		.where(and(eq(tasks.userId, userId), isNotNull(tasks.completedAt)))
		.orderBy(desc(tasks.completedAt))
		.limit(10);

	return {
		completedOnce: completed?.total ?? 0,
		recurringTasks: recurringAgg?.total ?? 0,
		recurringCompletions: recurringAgg?.completions ?? 0,
		topAssigners: assignerRows.map((r) => ({ name: r.name, total: r.total })),
		topAssignees: assigneeRows.map((r) => ({ name: r.name, total: r.total })),
		recentlyCompleted: recentRows.map((r) => ({
			title: r.title,
			completedAt: toIsoTimestamp(r.completedAt),
			recurring: !!r.recurrenceFrequency && r.completionCount > 0
		}))
	};
}
