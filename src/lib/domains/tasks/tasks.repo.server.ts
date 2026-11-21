/**
 * tasks repo: every query over `tasks`, `taskTags` and `taskCompletions`.
 *
 * Each function takes `db: Db` first, contains no authorization and no
 * business rules (visibility, the cursor policy, tags normalization and the
 * permission predicates live in the rules and the service), and reads only
 * this module's tables plus the declared read-only join into `events` for the
 * parent Event's title, start and calendar (rule R3,
 * `FOREIGN_READS.tasks`). `users` names and `familyMembers` scopes are NOT
 * joined here: the service asks identity and family for them and passes ids
 * in, so the "who is this person" and "who is in this family" reads have one
 * home.
 *
 * Writes take the caller's `now` (rule R5; nothing reads the process clock).
 * The column's own encoder decides the wire shape, so a `mode:'string'`
 * timestamp (`dueDate`, `completedAt`, `archivedAt`) is written and returned
 * as the string the caller supplies, while a `mode:'date'` column
 * (`createdAt`, `focusStartedAt`) takes a `Date`.
 *
 * Unordered reads: `listTagsForTasks` has no ORDER BY in the store, so the
 * array order is not part of the contract — the wire sorts tags.
 *
 * Doc: ./README.md#invariants
 */
import { and, desc, eq, gt, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '$lib/kernel/db/database.server';
import {
	events,
	taskCompletions,
	type NewTaskCompletionRow,
	type NewTaskRow,
	taskTags,
	tasks,
	type TaskCompletionRow,
	type TaskRow
} from '$lib/kernel/db/tables.server';

/** One Task row plus its parent Event's attribution (`null` when standalone). */
export type TaskRowWithEvent = TaskRow & {
	readonly eventTitle: string | null;
	readonly eventStart: string | null;
	readonly eventCalendarId: string | null;
};

/**
 * The columns a caller may rewrite on a Task. `id`, `userId` and `createdAt`
 * are deliberately absent: an update never re-owns, re-ids or re-stamps a row.
 */
export type TaskWritePatch = Partial<Omit<NewTaskRow, 'id' | 'createdAt' | 'userId'>>;

/** The row projection every list read shares, so the shapes cannot drift. */
const taskColumns = {
	id: tasks.id,
	title: tasks.title,
	notes: tasks.notes,
	dueDate: tasks.dueDate,
	completedAt: tasks.completedAt,
	archivedAt: tasks.archivedAt,
	recurrenceFrequency: tasks.recurrenceFrequency,
	recurrenceInterval: tasks.recurrenceInterval,
	completionCount: tasks.completionCount,
	assignedTo: tasks.assignedTo,
	assignmentStatus: tasks.assignmentStatus,
	priority: tasks.priority,
	visibility: tasks.visibility,
	userId: tasks.userId,
	familyId: tasks.familyId,
	eventId: tasks.eventId,
	focusMinutes: tasks.focusMinutes,
	focusStartedAt: tasks.focusStartedAt,
	category: tasks.category,
	createdAt: tasks.createdAt
} as const;

/** The task columns plus the parent Event's three attribution columns. */
const taskWithEventColumns = {
	...taskColumns,
	eventTitle: events.title,
	eventStart: events.start,
	eventCalendarId: events.calendarId
} as const;

/** A list read's FROM/JOIN: the Task row plus its parent Event, never the members. */
function tasksWithEvent(db: Db) {
	return db.select(taskWithEventColumns).from(tasks).leftJoin(events, eq(tasks.eventId, events.id));
}

// --- Task rows --------------------------------------------------------------

/** Store one Task and return the row as the database wrote it. */
export async function insertTask(db: Db, values: NewTaskRow): Promise<TaskRow> {
	const [row] = await db.insert(tasks).values(values).returning();
	if (!row) throw new Error('insertTask: insert returned no row');
	return row;
}

/** One Task by id, whatever its owner. `null` when no row has that id. */
export async function findTask(db: Db, id: string): Promise<TaskRow | null> {
	const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
	return row ?? null;
}

/** One Task by id, scoped to its owner (the owner's own patch path). */
export async function findOwnedTask(db: Db, id: string, userId: string): Promise<TaskRow | null> {
	const [row] = await db
		.select()
		.from(tasks)
		.where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
	return row ?? null;
}

/** Rewrite one Task's fields by id, owner unscoped. `null` when no row matched. */
export async function updateTaskById(
	db: Db,
	id: string,
	patch: TaskWritePatch
): Promise<TaskRow | null> {
	const [row] = await db.update(tasks).set(patch).where(eq(tasks.id, id)).returning();
	return row ?? null;
}

/**
 * Rewrite one Task scoped by its STORED family (`null` scopes to personal
 * rows) — the collaborator write (#232). A row that moved families misses.
 */
export async function updateTaskInFamily(
	db: Db,
	id: string,
	familyId: string | null,
	patch: TaskWritePatch
): Promise<TaskRow | null> {
	const [row] = await db
		.update(tasks)
		.set(patch)
		.where(
			and(eq(tasks.id, id), familyId === null ? isNull(tasks.familyId) : eq(tasks.familyId, familyId))
		)
		.returning();
	return row ?? null;
}

/** Hard-delete one open Task. Returns whether a row was removed. */
export async function deleteTaskById(db: Db, id: string): Promise<boolean> {
	const removed = await db.delete(tasks).where(eq(tasks.id, id)).returning({ id: tasks.id });
	return removed.length > 0;
}

/** Archive one completed Task (the row backs stats). `null` when no row matched. */
export async function archiveTaskById(
	db: Db,
	id: string,
	nowIso: string
): Promise<TaskRow | null> {
	const [row] = await db
		.update(tasks)
		.set({ archivedAt: nowIso })
		.where(eq(tasks.id, id))
		.returning();
	return row ?? null;
}

/**
 * "Clear completed": archive the caller's completed, unarchived rows — their
 * OWN ones and the assignments they ACCEPTED (Q-059) — and report how many
 * moved. Another member's row they merely see stays where it is.
 */
export async function archiveViewerCompletedTasks(
	db: Db,
	userId: string,
	nowIso: string
): Promise<number> {
	const archived = await db
		.update(tasks)
		.set({ archivedAt: nowIso })
		.where(
			and(
				or(
					eq(tasks.userId, userId),
					and(eq(tasks.assignedTo, userId), eq(tasks.assignmentStatus, 'accepted'))
				),
				isNotNull(tasks.completedAt),
				isNull(tasks.archivedAt)
			)
		)
		.returning({ id: tasks.id });
	return archived.length;
}

// --- List reads -------------------------------------------------------------

/**
 * The main list: the caller's own rows plus every row of their family,
 * archived excluded, newest `createdAt` first, with the parent Event joined.
 * TODAY ignores visibility on the family leg (Q-005a lands after S6).
 */
export async function listTasksForUser(
	db: Db,
	query: { readonly userId: string; readonly familyId: string | null }
): Promise<TaskRowWithEvent[]> {
	const scopes = [eq(tasks.userId, query.userId)];
	if (query.familyId) scopes.push(eq(tasks.familyId, query.familyId));
	return await tasksWithEvent(db)
		.where(and(or(...scopes), isNull(tasks.archivedAt)))
		.orderBy(desc(tasks.createdAt));
}

/**
 * The `?eventId=` read: the event's archived-excluded Task rows OLDEST first,
 * on the same Event-joined projection as the main list (Q-055 made the two
 * answers one shape). This read never runs the overdue pin.
 */
export async function listTasksForEvent(
	db: Db,
	eventId: string
): Promise<TaskRowWithEvent[]> {
	return await tasksWithEvent(db)
		.where(and(eq(tasks.eventId, eventId), isNull(tasks.archivedAt)))
		.orderBy(tasks.createdAt);
}

/**
 * MY TASKS: my personal rows (any visibility) OR rows assigned to me with an
 * ACCEPTED status. Newest first, archived excluded.
 */
export async function listMyTasks(db: Db, userId: string): Promise<TaskRowWithEvent[]> {
	return await tasksWithEvent(db)
		.where(
			and(
				or(
					and(isNull(tasks.familyId), eq(tasks.userId, userId)),
					and(eq(tasks.assignedTo, userId), eq(tasks.assignmentStatus, 'accepted'))
				),
				isNull(tasks.archivedAt)
			)
		)
		.orderBy(desc(tasks.createdAt));
}

/** TO ACCEPT: rows assigned to me while the handoff is still pending. */
export async function listPendingAssignments(db: Db, userId: string): Promise<TaskRowWithEvent[]> {
	return await tasksWithEvent(db)
		.where(
			and(
				eq(tasks.assignedTo, userId),
				eq(tasks.assignmentStatus, 'pending'),
				isNull(tasks.archivedAt)
			)
		)
		.orderBy(desc(tasks.createdAt));
}

/** REQUESTED BY ME: my rows carrying any assignee, whatever the status. */
export async function listRequestedByMe(db: Db, userId: string): Promise<TaskRowWithEvent[]> {
	return await tasksWithEvent(db)
		.where(
			and(eq(tasks.userId, userId), isNotNull(tasks.assignedTo), isNull(tasks.archivedAt))
		)
		.orderBy(desc(tasks.createdAt));
}

/** The Family Task Board's family list: every row of one family, newest first. */
export async function listFamilyTaskRows(db: Db, familyId: string): Promise<TaskRowWithEvent[]> {
	return await tasksWithEvent(db)
		.where(and(eq(tasks.familyId, familyId), isNull(tasks.archivedAt)))
		.orderBy(desc(tasks.createdAt));
}

/**
 * The Family Task Board's Public tab: PUBLIC personal rows (familyId null)
 * whose creator is one of `userIds` (the family's current members, supplied by
 * family). Newest first. The membership filter stays in SQL, so a creator who
 * left the family drops out even while their id is still passed.
 */
export async function listPublicFamilyTasks(
	db: Db,
	userIds: readonly string[]
): Promise<TaskRowWithEvent[]> {
	if (userIds.length === 0) return [];
	return await tasksWithEvent(db)
		.where(
			and(
				isNull(tasks.familyId),
				eq(tasks.visibility, 'public'),
				inArray(tasks.userId, [...userIds]),
				isNull(tasks.archivedAt)
			)
		)
		.orderBy(desc(tasks.createdAt));
}

// --- Tags -------------------------------------------------------------------

/**
 * The tag names of the given Tasks, keyed by task id. Unordered: the wire
 * sorts, so the read never claims an order it does not have.
 */
export async function listTagsForTasks(
	db: Db,
	taskIds: readonly string[]
): Promise<Map<string, string[]>> {
	const out = new Map<string, string[]>();
	if (taskIds.length === 0) return out;
	const rows = await db
		.select()
		.from(taskTags)
		.where(inArray(taskTags.taskId, [...taskIds]));
	for (const row of rows) {
		const list = out.get(row.taskId);
		if (list) list.push(row.name);
		else out.set(row.taskId, [row.name]);
	}
	return out;
}

/** Replace a Task's whole tag set (normalized names arrive from the rules). */
export async function replaceTaskTags(
	db: Db,
	taskId: string,
	names: readonly string[]
): Promise<void> {
	await db.delete(taskTags).where(eq(taskTags.taskId, taskId));
	if (names.length > 0) {
		await db.insert(taskTags).values(names.map((name) => ({ taskId, name })));
	}
}

/** Append tag rows without clearing the set (the create path's insert). */
export async function insertTaskTags(
	db: Db,
	taskId: string,
	names: readonly string[]
): Promise<void> {
	if (names.length === 0) return;
	await db.insert(taskTags).values(names.map((name) => ({ taskId, name })));
}

// --- Completions ------------------------------------------------------------

/** Append one completion-history row. */
export async function insertCompletion(
	db: Db,
	values: NewTaskCompletionRow
): Promise<TaskCompletionRow> {
	const [row] = await db.insert(taskCompletions).values(values).returning();
	if (!row) throw new Error('insertCompletion: insert returned no row');
	return row;
}

/** The latest history row of one Task (the undo rewind's anchor). */
export async function findLatestCompletion(
	db: Db,
	taskId: string
): Promise<{ readonly id: string; readonly completedAt: string } | null> {
	const [row] = await db
		.select({ id: taskCompletions.id, completedAt: taskCompletions.completedAt })
		.from(taskCompletions)
		.where(eq(taskCompletions.taskId, taskId))
		.orderBy(desc(taskCompletions.completedAt))
		.limit(1);
	return row ?? null;
}

/** Remove one history row (an undone completion). */
export async function deleteCompletionById(db: Db, id: string): Promise<void> {
	await db.delete(taskCompletions).where(eq(taskCompletions.id, id));
}

// --- Cursor writes ----------------------------------------------------------

/**
 * The completion's cursor advance, guarded by the due the caller read: a
 * second rapid click cannot advance again (the guarded UPDATE matches only
 * the first), and the count increments in the same statement. `null` when the
 * guard missed.
 */
export async function advanceCursorGuarded(
	db: Db,
	values: {
		readonly taskId: string;
		/** The due the caller read; `null` guards nothing (legacy). */
		readonly expectedDue: string | null;
		readonly dueDate: string;
	}
): Promise<TaskRow | null> {
	const guard = [eq(tasks.id, values.taskId)];
	if (values.expectedDue !== null) guard.push(eq(tasks.dueDate, values.expectedDue));
	const [row] = await db
		.update(tasks)
		.set({ dueDate: values.dueDate, completionCount: sql`${tasks.completionCount} + 1` })
		.where(and(...guard))
		.returning();
	return row ?? null;
}

/**
 * A one-off completion's guarded write: completing only matches a row still
 * open, un-completing only the row the caller read. A second rapid click finds
 * no row and writes no history (`null`), exactly like legacy
 * `mutations.toggleCompletion` — but now inside the caller's transaction.
 */
export async function toggleCompletionGuarded(
	db: Db,
	values: {
		readonly taskId: string;
		/** `true` = open → completed; `false` = un-complete the read row. */
		readonly completing: boolean;
		/** The new stamp: an instant when completing, `null` when reopening. */
		readonly completedAt: string | null;
		/** The completed stamp the caller read; guards the reopen. */
		readonly expectedCompletedAt: string | null;
	}
): Promise<TaskRow | null> {
	const guard = [eq(tasks.id, values.taskId)];
	if (values.completing) guard.push(isNull(tasks.completedAt));
	else if (values.expectedCompletedAt !== null) {
		guard.push(eq(tasks.completedAt, values.expectedCompletedAt));
	}
	const [row] = await db
		.update(tasks)
		.set({ completedAt: values.completedAt })
		.where(and(...guard))
		.returning();
	return row ?? null;
}

/**
 * The skip's cursor move: the next due only — skip is not complete, so a
 * completed row keeps its stamp (Q-058).
 */
export async function skipCursor(
	db: Db,
	values: { readonly taskId: string; readonly dueDate: string }
): Promise<TaskRow | null> {
	const [row] = await db
		.update(tasks)
		.set({ dueDate: values.dueDate })
		.where(eq(tasks.id, values.taskId))
		.returning();
	return row ?? null;
}

/**
 * The undo's cursor rewind: restore the previous due and decrement the tally,
 * never below zero. The `completionCount > 0` guard makes a double-tap a
 * no-op (`null`).
 */
export async function rewindCursorGuarded(
	db: Db,
	values: { readonly taskId: string; readonly dueDate: string }
): Promise<TaskRow | null> {
	const [row] = await db
		.update(tasks)
		.set({
			dueDate: values.dueDate,
			completionCount: sql`greatest(0, ${tasks.completionCount} - 1)::int`
		})
		.where(and(eq(tasks.id, values.taskId), gt(tasks.completionCount, 0)))
		.returning();
	return row ?? null;
}

/**
 * The overdue pin: one batched UPDATE over the ids the caller already found
 * stale. Returns the number of rows moved (0 when the list is empty, so the
 * caller can skip the statement entirely).
 */
export async function pinDueDates(
	db: Db,
	values: { readonly taskIds: readonly string[]; readonly dueDate: string }
): Promise<number> {
	if (values.taskIds.length === 0) return 0;
	const updated = await db
		.update(tasks)
		.set({ dueDate: values.dueDate })
		.where(inArray(tasks.id, [...values.taskIds]))
		.returning({ id: tasks.id });
	return updated.length;
}

/**
 * The rows the overdue pin must look at for one scope: open, dated, recurring,
 * unarchived Tasks owned by `userId`, belonging to `familyId`, and/or created
 * by one of `memberIds` (the Family Task Board Public tab's member-personal
 * leg — personal rows of the family's members, which no other scope covers).
 * Pure scope selection — the "is it stale" test is the rule's.
 */
export async function listPinnableTasks(
	db: Db,
	scope: {
		readonly userId: string | null;
		readonly familyId: string | null;
		readonly memberIds?: readonly string[] | null;
	}
): Promise<{ readonly id: string; readonly dueDate: string | null }[]> {
	const legs = [];
	if (scope.userId) legs.push(eq(tasks.userId, scope.userId));
	if (scope.familyId) legs.push(eq(tasks.familyId, scope.familyId));
	if (scope.memberIds && scope.memberIds.length > 0) {
		legs.push(inArray(tasks.userId, [...scope.memberIds]));
	}
	if (legs.length === 0) return [];
	return await db
		.select({ id: tasks.id, dueDate: tasks.dueDate })
		.from(tasks)
		.where(
			and(
				isNotNull(tasks.recurrenceFrequency),
				isNull(tasks.completedAt),
				isNull(tasks.archivedAt),
				isNotNull(tasks.dueDate),
				legs.length === 1 ? legs[0] : or(...legs)
			)
		);
}

/**
 * Moves every Task one person owns to another — the guest merge
 * (`guestMergeService.ts:74-77`). Ids, tags, completions and assignments are
 * untouched: only the owner column changes.
 */
export async function moveTasksOwnedBy(
	db: Db,
	input: { readonly from: string; readonly to: string }
): Promise<number> {
	const moved = await db
		.update(tasks)
		.set({ userId: input.to })
		.where(eq(tasks.userId, input.from))
		.returning({ id: tasks.id });
	return moved.length;
}

/** How many Tasks one person owns — the `/merge-guest` prompt's count. */
export async function countTasksOwnedBy(db: Db, userId: string): Promise<number> {
	const rows = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.userId, userId));
	return rows.length;
}
