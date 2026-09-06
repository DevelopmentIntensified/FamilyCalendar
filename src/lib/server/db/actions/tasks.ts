import { db } from '$lib/server/db';
import {
	tasks,
	events,
	users,
	familyMembers,
	taskCompletions,
	taskTags,
	type Task
} from '$lib/server/db/schema';
import { and, eq, inArray, or, desc, gt, isNotNull, isNull, sql } from 'drizzle-orm';
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
	dueIso: string | Date | null,
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

/**
 * A task plus its tag names (normalized, sorted).
 * List queries (getTasksForUser/getTasksForFamily) also attach join
 * attribution, so consumers of those rows may read the optional fields.
 */
export type TaskWithTags = Task & {
	tags: string[];
	assigneeFirstName?: string | null;
	assigneeLastName?: string | null;
	creatorFirstName?: string | null;
	eventTitle?: string | null;
	eventStart?: string | null;
};

/** True for usable tag name strings. */
function isTagName(t: unknown): t is string {
	return typeof t === 'string';
}

/** Normalize raw tag input: lowercase, trim, drop empties, dedupe, sort. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- exported boundary parser: unknown input IS its contract; routes feed it raw request-body fields.
export function normalizeTags(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const t of raw) {
		if (!isTagName(t)) continue;
		const name = t.trim().toLowerCase();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		out.push(name);
	}
	return out.sort();
}

/** Fan `tags` out onto a list of task rows by id (id stays a string in both). */
async function attachTags(rows: { id: string }[]): Promise<Map<string, string[]>> {
	const map = new Map<string, string[]>();
	if (rows.length === 0) return map;
	const ids = rows.map((r) => r.id);
	if (ids.length === 0) return map;
	const tagRows = await db.select().from(taskTags).where(inArray(taskTags.taskId, ids));
	for (const tr of tagRows) {
		const key = String(tr.taskId);
		const list = map.get(key) ?? [];
		list.push(tr.name);
		map.set(key, list);
	}
	for (const list of map.values()) list.sort();
	return map;
}

export async function createTask(data: {
	title: string;
	notes?: string | null;
	dueDate?: string | null;
	recurrenceFrequency?: string | null;
	recurrenceInterval?: number | null;
	assignedTo?: string | null;
	assignmentStatus?: string | null;
	priority?: string | null;
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

/** Personal tasks + family tasks + tasks attached to the given events,
 *  with the parent event's title/start so lists can attribute them. */
export async function getTasksForUser(
	userId: string,
	familyId?: string | null
): Promise<TaskWithTags[]> {
	const conditions = [eq(tasks.userId, userId)];
	if (familyId) {
		conditions.push(eq(tasks.familyId, familyId));
	}
	const rows = await db
		.select({
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
	const tagMap = await attachTags(rows);
	return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));
}

export async function getTasksForEvent(eventId: string) {
	return await db
		.select()
		.from(tasks)
		.where(and(eq(tasks.eventId, eventId), isNull(tasks.archivedAt)))
		.orderBy(tasks.createdAt);
}

/** Every task in a family, with assignee and creator attribution. */
export async function getTasksForFamily(familyId: string): Promise<TaskWithTags[]> {
	const rows = await db
		.select({
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
	const tagMap = await attachTags(rows);
	return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));
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
 * Completing a Recurring Task rolls the cursor onto the next
 * scheduled occurrence instead of closing it out.
 *
 * Called only for OPEN recurring tasks (completedAt is null — the cursor
 * row is never "completed"); the dueDate-guarded update doubles as
 * double-click protection.
 */
async function advanceRecurringTask(
	task: Task,
	zone?: string,
	actorId?: string
): Promise<Task | undefined> {
	if (!task.recurrenceFrequency) return undefined;
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
		// update actually matched (double-clicks insert nothing). The
		// ACTING user is recorded so wins/streaks attribute to whoever
		// checked it off, not the task owner.
		await db.insert(taskCompletions).values({
			taskId: advanced.id,
			userId: advanced.userId,
			actorId: actorId ?? null,
			familyId: advanced.familyId ?? null
		});
		return advanced;
	}
	const [fresh] = await db.select().from(tasks).where(eq(tasks.id, task.id));
	return fresh;
}

/**
 * Single family-membership seam: existence of a familyMembers row grants
 * family-scoped rights. `role` is permission-only per ADR-0001 and is never
 * consulted here; `memberType` is profile-only and likewise ignored.
 */
export async function isFamilyMember(userId: string, familyId: string): Promise<boolean> {
	const [member] = await db
		.select({ familyId: familyMembers.familyId })
		.from(familyMembers)
		.where(and(eq(familyMembers.userId, userId), eq(familyMembers.familyId, familyId)));
	return Boolean(member);
}

/**
 * Permission predicate for mutating a task: the owner, the assignee, or any
 * member of the task's family may mutate it. Family membership is the only
 * DB-backed leg, so the lookup runs only when the cheaper owned/assigned
 * checks fail (mirrors the behaviour of the caller's original inline guard).
 */
export async function canMutateTask(task: Task, userId: string): Promise<boolean> {
	const owned = task.userId === userId;
	const assigned = task.assignedTo === userId;
	if (owned || assigned) return true;
	// Family tasks: membership grants rights. A private task (no family)
	// leaves an unrelated caller with no access.
	if (!task.familyId) return false;
	return isFamilyMember(userId, task.familyId);
}

/** Assignment-only patch for task reassignment responses. */
export type AssignmentPatch = {
	assignedTo?: string | null;
	assignmentStatus?: string | null;
};

/**
 * Assignment authority for a caller who does NOT own the task: the
 * current assignee may accept, or decline (release back to the pool),
 * their own assignment. Everything else assignment-shaped — reassign,
 * re-target, clear someone else's assignment — stays owner-only and
 * comes back as null (the caller turns that into a 403). An empty
 * patch (tags-only edit) passes through untouched.
 */
export function nonOwnerAssignmentPatch(
	task: Pick<Task, 'assignedTo'>,
	callerId: string,
	patch: AssignmentPatch
): AssignmentPatch | null {
	if (Object.keys(patch).length === 0) return {};
	if (task.assignedTo !== callerId) return null;
	if (patch.assignedTo === undefined && patch.assignmentStatus === 'accepted') {
		return { assignmentStatus: 'accepted' };
	}
	if (patch.assignedTo === null && patch.assignmentStatus === 'none') {
		return { assignedTo: null, assignmentStatus: 'none' };
	}
	return null;
}

/**
 * Assignment target check: a task may be assigned to the creator
 * themself, or to an existing member of the target family. Anything
 * else would strand the task as a pending row its assignee can never
 * see. Self-assignment needs no lookup; otherwise the familyMembers
 * row is the single membership seam.
 */
export async function isValidAssignee(
	callerId: string,
	familyId: string | null,
	assignedTo: string
): Promise<boolean> {
	if (assignedTo === callerId) return true;
	if (!familyId) return false;
	const [member] = await db
		.select({ familyId: familyMembers.familyId })
		.from(familyMembers)
		.where(and(eq(familyMembers.userId, assignedTo), eq(familyMembers.familyId, familyId)));
	return Boolean(member);
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

export async function deleteTask(id: string, userId: string) {
	const [task] = await db
		.select({ completedAt: tasks.completedAt })
		.from(tasks)
		.where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
	if (!task) return;

	// Completed tasks back the stats/streak history, so removing one archives
	// it instead of deleting. Open tasks have no stats attached — hard delete.
	if (task.completedAt) {
		await db.update(tasks).set({ archivedAt: new Date().toISOString() }).where(eq(tasks.id, id));
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

/**
 * Skip the current occurrence of a Recurring Task: roll the cursor forward
 * without marking it complete. The creator, the assignee, or any member of
 * the task's family (family tasks only) may advance. Returns the moved task
 * row, or null when the task is missing / non-recurring / not theirs.
 */
export async function advanceTaskToNext(
	taskId: string,
	userId: string,
	zone?: string
): Promise<Task | null> {
	const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
	if (!task || !task.recurrenceFrequency) return null;

	if (!(await canMutateTask(task, userId))) return null;

	const nowIso = zone ? zonedNow(zone).toISO()! : new Date().toISOString();
	const dueDate = advanceCursor(
		task.dueDate,
		task.recurrenceFrequency,
		task.recurrenceInterval ?? 1,
		nowIso
	);
	const [updated] = await db
		.update(tasks)
		.set({ dueDate, completedAt: null })
		.where(eq(tasks.id, taskId))
		.returning();
	return updated ?? null;
}

/**
 * Server-side previous-cursor derivation for an undo, following the
 * cursor v3 semantics documented at the top of this file: the check-off
 * anchored at the completion day and advanced by the smallest multiple
 * of the interval that landed strictly past the previous due date.
 * Rewind the current cursor interval-by-interval and keep the first
 * candidate whose re-advance reproduces the current due date. Falls
 * back to a plain one-interval rewind when nothing matches (e.g. a
 * hand-edited due date).
 */
function derivePreviousCursor(
	dueIso: string,
	frequency: string,
	interval: number | null,
	completedAtIso: string | null
): string | null {
	const due = toDateTime(dueIso);
	if (!due) return null;
	const dueIsoNormalized = due.toISO()!;
	const step = Math.max(1, Math.floor(interval ?? 1) || 1);
	const anchor = completedAtIso ?? new Date().toISOString();
	for (let k = 1; k <= 366; k += 1) {
		const candidate = plusInterval(due, frequency, -step * k).toISO()!;
		const reAdvanced = toDateTime(advanceCursor(candidate, frequency, step, anchor));
		if (reAdvanced?.toISO() === dueIsoNormalized) return candidate;
	}
	return plusInterval(due, frequency, -step).toISO()!;
}

/**
 * Reverse a Recurring Task check-off: restore the previous due date,
 * decrement the completion tally, and remove the matching history row so
 * streaks/stats don't count an undone completion.
 *
 * The client's `previousDueDate` is only a hint: it is accepted when it is
 * a valid cursor strictly before the current due date, otherwise the
 * previous cursor is derived server-side. The task update and the history
 * delete run in ONE transaction, and the `completionCount > 0` guard makes
 * a double-tap on Undo a no-op.
 */
export async function undoRecurringCompletion(
	taskId: string,
	userId: string,
	previousDueDate: string | null
): Promise<Task | null> {
	const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
	if (!task || !task.recurrenceFrequency) return null;

	if (!(await canMutateTask(task, userId))) return null;

	return db.transaction(async (tx) => {
		// The latest completion row is the server-side evidence of the
		// check-off being undone; its completedAt anchors the cursor rewind.
		const [latest] = await tx
			.select({ id: taskCompletions.id, completedAt: taskCompletions.completedAt })
			.from(taskCompletions)
			.where(eq(taskCompletions.taskId, taskId))
			.orderBy(desc(taskCompletions.completedAt))
			.limit(1);

		const clientPrevious = toDateTime(previousDueDate);
		const currentDue = toDateTime(task.dueDate);
		// Only trust a client cursor that is strictly before the current due
		// date — anything else (stale, future, garbage) is replaced by the
		// server-derived previous cursor.
		const previous =
			clientPrevious && currentDue && clientPrevious < currentDue
				? clientPrevious.toISO()!
				: derivePreviousCursor(
						task.dueDate ?? '',
						task.recurrenceFrequency!,
						task.recurrenceInterval,
						latest?.completedAt ?? null
					);

		const [updated] = await tx
			.update(tasks)
			.set({
				dueDate: previous,
				completionCount: sql`greatest(0, ${tasks.completionCount} - 1)::int`
			})
			.where(and(eq(tasks.id, taskId), gt(tasks.completionCount, 0)))
			.returning();
		if (!updated) return null;

		// Remove the most recent completion history row so streaks/stats don't
		// count an undone completion.
		if (latest) {
			await tx.delete(taskCompletions).where(eq(taskCompletions.id, latest.id));
		}
		return updated;
	});
}

/** Family-scoped assignment responses (accept/decline/release) and tags. */
export async function updateTaskInFamily(
	id: string,
	familyId: string,
	data: Partial<Pick<Task, 'assignmentStatus' | 'assignedTo' | 'priority'>> & {
		tags?: string[] | null;
	}
): Promise<TaskWithTags | undefined> {
	const hasTags = data.tags !== undefined;
	const patch = Object.fromEntries(
		Object.entries(data).filter(([k, v]) => k !== 'tags' && v !== undefined)
	);
	if (Object.keys(patch).length === 0 && !hasTags) return undefined;
	return db.transaction(async (tx) => {
		let row: Task | undefined;
		if (Object.keys(patch).length > 0) {
			const [updated] = await tx
				.update(tasks)
				.set(patch)
				.where(and(eq(tasks.id, id), eq(tasks.familyId, familyId)))
				.returning();
			row = updated;
		} else {
			const [existing] = await tx
				.select()
				.from(tasks)
				.where(and(eq(tasks.id, id), eq(tasks.familyId, familyId)));
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
 * Overdue Recurring Tasks stick to today: their due date follows the
 * current date until dismissed. Piggybacked on task/calendar loads.
 *
 * Scope: the caller's OWN tasks plus — when a family is known — every task
 * in that family. (The old `userId AND familyId` conjunction made the
 * family leg unreachable, so other members' family-task cursors never
 * pinned; an OR over the same family scope fixes that while staying
 * scoped to the caller's family.)
 */
export async function syncRecurringCursors(
	userId: string,
	familyId?: string | null,
	zone?: string
) {
	const nowIso = zone ? zonedNow(zone).toISO()! : new Date().toISOString();
	const todayEnd = DateTime.fromISO(nowIso)
		.set({ hour: 23, minute: 59, second: 0, millisecond: 0 })
		.toISO()!;

	const base = [
		isNotNull(tasks.recurrenceFrequency),
		isNull(tasks.completedAt),
		isNull(tasks.archivedAt),
		isNotNull(tasks.dueDate)
	];
	const scope = familyId
		? or(eq(tasks.userId, userId), eq(tasks.familyId, familyId))
		: eq(tasks.userId, userId);

	const stale = (
		await db
			.select({ id: tasks.id, dueDate: tasks.dueDate })
			.from(tasks)
			.where(and(...base, scope))
	).filter((t) => needsOverduePin(t.dueDate, nowIso));

	for (const row of stale) {
		await db.update(tasks).set({ dueDate: todayEnd }).where(eq(tasks.id, row.id));
	}
}
