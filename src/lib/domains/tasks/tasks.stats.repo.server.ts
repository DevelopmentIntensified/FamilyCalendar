/**
 * tasks stats repo: the completion-counting queries and the ONE attribution
 * predicate (`attributedToViewer`), plus the completion instants the streak's
 * window reads.
 *
 * Every completion figure counts `taskCompletions`, never
 * `tasks.completedAt`/`completionCount` (#146): the history row is the one
 * record that survives the recurring cursor overwriting itself and an undo
 * removing the row again.
 *
 * Names are NOT joined here: `topAssigners`/`topAssignees`/`doneBy` answer ids
 * and counts, and the service asks identity for the names, so
 * `firstName || ' ' || lastName` (with its trailing-space behaviour) has one
 * home. `users` never appears in this file.
 *
 * Writes: none. `monthStart` arrives as the caller's instant (rule R5); the
 * `completedAt` column is `mode:'string'`, so the comparison takes the same
 * Postgres-render shape the column returns.
 *
 * Doc: ./README.md#invariants
 */
import { and, count, desc, eq, gte, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import type { Db } from '$lib/kernel/db/database.server';
import { taskCompletions, tasks } from '$lib/kernel/db/tables.server';

/**
 * Attribution for completion history: rows written since the `actorId`
 * column carry the ACTING user; legacy rows only have the task owner in
 * `userId`. Either leg attributes a completion to the viewer. ONE home (#092)
 * — the dashboard's streak and this module's figures must not grow copies.
 */
export function attributedToViewer(userId: string) {
	return or(
		and(isNotNull(taskCompletions.actorId), eq(taskCompletions.actorId, userId)),
		and(isNull(taskCompletions.actorId), eq(taskCompletions.userId, userId))
	);
}

/** Distinct Tasks the viewer completed at least once. */
export async function countCompletedOnce(db: Db, userId: string): Promise<number> {
	const [row] = await db
		.select({ total: sql<number>`count(distinct ${taskCompletions.taskId})::int` })
		.from(taskCompletions)
		.where(attributedToViewer(userId));
	return row?.total ?? 0;
}

/** How many recurring Task ROWS the viewer owns (a task count, not completions). */
export async function countRecurringTasks(db: Db, userId: string): Promise<number> {
	const [row] = await db
		.select({ total: count() })
		.from(tasks)
		.where(and(eq(tasks.userId, userId), isNotNull(tasks.recurrenceFrequency)));
	return row?.total ?? 0;
}

/** The viewer's check-offs of a recurring Task. */
export async function countRecurringCompletions(db: Db, userId: string): Promise<number> {
	const [row] = await db
		.select({ total: count() })
		.from(taskCompletions)
		.innerJoin(tasks, eq(taskCompletions.taskId, tasks.id))
		.where(and(attributedToViewer(userId), isNotNull(tasks.recurrenceFrequency)));
	return row?.total ?? 0;
}

/**
 * Who assigned THIS user the most Tasks: creator ids with counts, most first,
 * capped. The viewer's own rows are excluded (self-assignment is not a handoff).
 */
export async function listTopAssignerIds(
	db: Db,
	values: { readonly userId: string; readonly limit: number }
): Promise<{ readonly id: string; readonly total: number }[]> {
	return await db
		.select({ id: tasks.userId, total: count() })
		.from(tasks)
		.where(and(eq(tasks.assignedTo, values.userId), ne(tasks.userId, values.userId)))
		.groupBy(tasks.userId)
		.orderBy(desc(count()))
		.limit(values.limit);
}

/** Who this user assigns the most Tasks to: assignee ids with counts, capped. */
export async function listTopAssigneeIds(
	db: Db,
	values: { readonly userId: string; readonly limit: number }
): Promise<{ readonly id: string; readonly total: number }[]> {
	return await db
		.select({ id: sql<string>`${tasks.assignedTo}`, total: count() })
		.from(tasks)
		.where(
			and(
				eq(tasks.userId, values.userId),
				ne(tasks.assignedTo, values.userId),
				isNotNull(tasks.assignedTo)
			)
		)
		.groupBy(tasks.assignedTo)
		.orderBy(desc(count()))
		.limit(values.limit);
}

/** The viewer's latest check-offs joined to their Tasks, newest first. */
export async function listRecentCompletions(
	db: Db,
	values: { readonly userId: string; readonly limit: number }
): Promise<
	{ readonly title: string; readonly completedAt: string; readonly recurrenceFrequency: string | null }[]
> {
	return await db
		.select({
			title: tasks.title,
			completedAt: taskCompletions.completedAt,
			recurrenceFrequency: tasks.recurrenceFrequency
		})
		.from(taskCompletions)
		.innerJoin(tasks, eq(taskCompletions.taskId, tasks.id))
		.where(attributedToViewer(values.userId))
		.orderBy(desc(taskCompletions.completedAt))
		.limit(values.limit);
}

/** This month's check-offs, split by whether the Task recurs. */
export async function monthTotals(
	db: Db,
	values: { readonly userId: string; readonly monthStart: string }
): Promise<{ readonly completed: number; readonly recurring: number }> {
	const [row] = await db
		.select({
			total: count(),
			recurring: sql<number>`count(*) filter (where ${tasks.recurrenceFrequency} is not null)::int`
		})
		.from(taskCompletions)
		.innerJoin(tasks, eq(taskCompletions.taskId, tasks.id))
		.where(
			and(
				attributedToViewer(values.userId),
				gte(taskCompletions.completedAt, values.monthStart)
			)
		);
	return { completed: row?.total ?? 0, recurring: row?.recurring ?? 0 };
}

/**
 * Who actually checked the viewer's Tasks off (the acting user), most active
 * first. Deliberately scoped to the viewer's OWN Task rows (#092): this
 * breakdown names the other people who did the work on them, so
 * viewer-attribution would collapse it to one row. The service passes 6 —
 * legacy `taskStats.ts:135`'s cap, one more than the assigner/assignee lists.
 */
export async function listDoneByIds(
	db: Db,
	values: { readonly userId: string; readonly limit: number }
): Promise<{ readonly id: string; readonly total: number }[]> {
	return await db
		.select({ id: sql<string>`${taskCompletions.actorId}`, total: count() })
		.from(taskCompletions)
		.where(and(eq(taskCompletions.userId, values.userId), isNotNull(taskCompletions.actorId)))
		.groupBy(taskCompletions.actorId)
		.orderBy(desc(count()))
		.limit(values.limit);
}

/**
 * One ISO instant per attributed history row, newest first, capped at the
 * streak's 365-row window. Raw `mode:'string'` renders; the service normalizes
 * them (a no-op normalizer keeps the contract's ISO shape).
 */
export async function listCompletionInstants(
	db: Db,
	values: { readonly userId: string; readonly limit: number }
): Promise<string[]> {
	const rows = await db
		.select({ completedAt: taskCompletions.completedAt })
		.from(taskCompletions)
		.where(attributedToViewer(values.userId))
		.orderBy(desc(taskCompletions.completedAt))
		.limit(values.limit);
	return rows.map((row) => row.completedAt);
}
