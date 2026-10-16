// Recurring Task cursor (issue #113): v3 cursor policy, overdue pinning,
// skip/undo actions, and the sweep that pins cursors before reads (issue 110).

import { and, desc, eq, gt, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { db } from '$lib/server/db';
import { familyMembers, taskCompletions, tasks, type Task } from '$lib/server/db/schema';
import { toDateTime } from '$lib/server/utils/eventTimes';
import { zonedNow } from '$lib/server/utils/userTimezone';
import { scheduleStep, type RecurrenceFrequency } from '$lib/server/services/recurrenceService';
import { canMutateTask } from './auth';

/**
 * Recurring Task cursor v3. Exactly one live occurrence exists at a
 * time. Completing snaps the next one to today + n*interval, where n
 * is the smallest multiple that lands strictly past the current due
 * date (early checks advance; if the due date already sits one
 * interval out, the next check takes two intervals, and so on).
 */
/**
 * Task cursor stepping delegates to the shared scheduleStep (single
 * mechanism for frequency+interval math; see recurrenceService). The
 * POLICY stays here: the task cursor anchors on today (completion day).
 */
function plusInterval(dt: DateTime, frequency: string, step: number): DateTime {
	// SAFETY: frequency is written only through TASK_FREQUENCIES-validated
	// boundaries; scheduleStep re-checks the closed set and throws otherwise.
	return scheduleStep(dt, frequency as RecurrenceFrequency, step, 1);
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
 * Completing a Recurring Task rolls the cursor onto the next
 * scheduled occurrence instead of closing it out.
 *
 * Called only for OPEN recurring tasks (completedAt is null — the cursor
 * row is never "completed"); the dueDate-guarded update doubles as
 * double-click protection.
 */
// Not part of the public barrel: mutations calls this via applyToggle.
export async function advanceRecurringTask(
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

/**
 * Overdue Recurring Tasks stick to today: their due date follows the
 * current date until dismissed. Piggybacked on task loads — the list
 * readers (getTasksForUser/getTasksForFamily/getPublicTasksForFamily)
 * own this call, so a read cannot happen unpinned (issue 110).
 *
 * Scope: the caller's OWN tasks plus — when a family is known — every task
 * in that family (an OR over the same scopes; the old `userId AND familyId`
 * conjunction made the family leg unreachable, so other members'
 * family-task cursors never pinned). With `null` userId only the family leg
 * runs; with `memberPersonal` only family-less personal rows of the family's
 * members are added (the family page's public tab reads those).
 */
export async function syncRecurringCursors(
	userId: string | null,
	familyId: string | null | undefined,
	zone?: string,
	memberPersonal = false
) {
	const nowIso = zone ? zonedNow(zone).toISO()! : new Date().toISOString();
	const todayEnd = DateTime.fromISO(nowIso)
		.set({ hour: 23, minute: 59, second: 0, millisecond: 0 })
		.toISO()!;

	const scopeLegs: SQL[] = [];
	if (userId) scopeLegs.push(eq(tasks.userId, userId));
	if (familyId) {
		scopeLegs.push(eq(tasks.familyId, familyId));
		if (memberPersonal) {
			scopeLegs.push(
				inArray(
					tasks.userId,
					db
						.select({ id: familyMembers.userId })
						.from(familyMembers)
						.where(eq(familyMembers.familyId, familyId))
				)
			);
		}
	}
	if (scopeLegs.length === 0) return;
	const scope = scopeLegs.length === 1 ? scopeLegs[0] : or(...scopeLegs);

	const base = [
		isNotNull(tasks.recurrenceFrequency),
		isNull(tasks.completedAt),
		isNull(tasks.archivedAt),
		isNotNull(tasks.dueDate)
	];

	// One SELECT + one batched UPDATE (#041) — ids are scope-filtered here,
	// so the update needs only the id list. Previously N sequential UPDATEs.
	const staleIds = (
		await db
			.select({ id: tasks.id, dueDate: tasks.dueDate })
			.from(tasks)
			.where(and(...base, scope))
	)
		.filter((t) => needsOverduePin(t.dueDate, nowIso))
		.map((t) => t.id);

	if (staleIds.length === 0) return;
	await db.update(tasks).set({ dueDate: todayEnd }).where(inArray(tasks.id, staleIds));
}
