import { db } from '$lib/server/db';
import { taskCompletions, tasks, users } from '$lib/server/db/schema';
import { and, count, desc, eq, gte, isNotNull, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DateTime } from 'luxon';

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
	/** This calendar month's check-offs, split by recurring task — #146. */
	month: { completed: number; recurring: number };
	/** Who actually checked things off (the acting user), most active first. */
	doneBy: { name: string; count: number }[];
}

/**
 * Aggregate task stats for a user: completions, recurring load,
 * who assigns them the most and who they assign the most.
 *
 * #146: EVERY completion figure below is counted from the `taskCompletions`
 * history table — the one record that survives the recurring-task cursor
 * overwriting itself. `tasks.completedAt` is null for recurring tasks and is
 * cleared on undo for one-offs; `tasks.completionCount` is the cursor's tally.
 * Neither backs a number here. The month totals and the "done by" list live in
 * this shared action too (moved from the stats loader) so there is exactly one
 * counting path.
 */
export async function getTaskStats(userId: string): Promise<TaskStats> {
	// Tasks completed at least once — distinct tasks in the history. Repeated
	// check-offs of one repeating task do not inflate this figure.
	const [completed] = await db
		.select({ total: sql<number>`count(distinct ${taskCompletions.taskId})::int` })
		.from(taskCompletions)
		.where(eq(taskCompletions.userId, userId));

	// Recurring load: how many repeating task rows exist. This is a count of
	// tasks, not completions — the cursor does not touch it.
	const [recurringAgg] = await db
		.select({ total: count() })
		.from(tasks)
		.where(and(eq(tasks.userId, userId), isNotNull(tasks.recurrenceFrequency)));

	// Real check-offs: one history row per completion (written by the
	// recurrence path itself, removed again by undo).
	const [recurringCompletionsRow] = await db
		.select({ total: count() })
		.from(taskCompletions)
		.innerJoin(tasks, eq(taskCompletions.taskId, tasks.id))
		.where(
			and(eq(taskCompletions.userId, userId), isNotNull(tasks.recurrenceFrequency))
		);

	// Who has assigned THIS user the most tasks.
	const assignerRows = await db
		.select({
			name: sql<string>`${creator.firstName} || ' ' || ${creator.lastName}`,
			total: count()
		})
		.from(tasks)
		.innerJoin(creator, eq(tasks.userId, creator.id))
		.where(and(eq(tasks.assignedTo, userId), ne(tasks.userId, userId)))
		.groupBy(creator.id, creator.firstName, creator.lastName)
		.orderBy(desc(count()))
		.limit(5);

	// Who this user assigns the most tasks TO.
	const assigneeRows = await db
		.select({
			name: sql<string>`${assignee.firstName} || ' ' || ${assignee.lastName}`,
			total: count()
		})
		.from(tasks)
		.innerJoin(assignee, eq(tasks.assignedTo, assignee.id))
		.where(and(eq(tasks.userId, userId), ne(tasks.assignedTo, userId)))
		.groupBy(assignee.id, assignee.firstName, assignee.lastName)
		.orderBy(desc(count()))
		.limit(5);

	// Recently completed: the latest history instants joined to their tasks.
	// Reading `tasks.completedAt` here made recurring tasks invisible (the
	// cursor keeps that column null) and showed undo-cleared one-offs.
	const recentRows = await db
		.select({
			title: tasks.title,
			completedAt: taskCompletions.completedAt,
			recurrenceFrequency: tasks.recurrenceFrequency
		})
		.from(taskCompletions)
		.innerJoin(tasks, eq(taskCompletions.taskId, tasks.id))
		.where(eq(taskCompletions.userId, userId))
		.orderBy(desc(taskCompletions.completedAt))
		.limit(10);

	// The two numbers the stats page shows under "This month", counted over
	// the month that is actually running — same history table.
	const monthStart = DateTime.now().startOf('month').toUTC().toISO();
	const [monthRow] = await db
		.select({
			total: count(),
			recurring: sql<number>`count(*) filter (where ${tasks.recurrenceFrequency} is not null)::int`
		})
		.from(taskCompletions)
		.innerJoin(tasks, eq(taskCompletions.taskId, tasks.id))
		.where(and(eq(taskCompletions.userId, userId), gte(taskCompletions.completedAt, monthStart)));

	// Who actually checked things off. `actorId` is the ACTING user, which is
	// what separates "assigned to" from "done by"; a row with no actor
	// cannot be attributed to anyone and drops out of the join.
	const actorRows = await db
		.select({ name: users.firstName, count: count() })
		.from(taskCompletions)
		.innerJoin(users, eq(taskCompletions.actorId, users.id))
		.where(eq(taskCompletions.userId, userId))
		.groupBy(users.id, users.firstName)
		.orderBy(desc(count()))
		.limit(6);

	return {
		completedOnce: completed?.total ?? 0,
		recurringTasks: recurringAgg?.total ?? 0,
		recurringCompletions: recurringCompletionsRow?.total ?? 0,
		topAssigners: assignerRows.map((r) => ({ name: r.name, total: r.total })),
		topAssignees: assigneeRows.map((r) => ({ name: r.name, total: r.total })),
		recentlyCompleted: recentRows.map((r) => ({
			title: r.title,
			completedAt: toIsoTimestamp(r.completedAt),
			recurring: !!r.recurrenceFrequency
		})),
		month: { completed: monthRow?.total ?? 0, recurring: monthRow?.recurring ?? 0 },
		doneBy: actorRows.map((r) => ({ name: r.name, count: r.count }))
	};
}
