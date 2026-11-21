/**
 * tasks completion service: the three Recurring Task cursor actions a
 * `PUT /api/tasks/[id]` body can ask for — check off (the cursor advance on an
 * open recurring row, the plain toggle otherwise), skip the current
 * occurrence, and undo the last check-off — plus the stored-zone read they
 * share with the item reads.
 *
 * Every action authorizes through the one mutation rule
 * (`canMutateTask`, with the viewer's family membership as a flag from
 * family); a caller without rights gets the same 404 an unknown id gets, so
 * the wire cannot tell the two apart (legacy `auth.canMutateTask`,
 * `cursor.ts`). The guarded UPDATE and the history row it produces run in ONE
 * transaction (`withTx`) — legacy wrote the row after the guarded update
 * outside a transaction, and a crash between the two lost a completion from
 * stats and streaks (sheet: "a crash between the two loses a completion").
 *
 * Time is `ctx.clock`; the cursor anchors on the caller's STORED zone
 * (identity's `getTimeZone`), falling back to UTC when no zone is stored —
 * never the process zone (legacy `zonedNow` with no zone read the server day).
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { withTx } from '$lib/kernel/db/database.server';
import type { TaskRow } from '$lib/kernel/db/tables.server';
import { notFound } from '$lib/kernel/errors/appError';
import { createAlert } from '$lib/domains/alerts/index.server';
import { listPersonFamilyIds } from '$lib/domains/family/index.server';
import { getPerson, getTimeZone } from '$lib/domains/identity/index.server';
import {
	advanceCursorGuarded,
	deleteCompletionById,
	findLatestCompletion,
	findTask,
	insertCompletion,
	rewindCursorGuarded,
	skipCursor,
	toggleCompletionGuarded
} from './tasks.repo.server';
import { canMutateTask } from './tasks.task.rules';
import { derivePreviousDue, nextCursorDue } from './tasks.cursor.rules';

/** A cursor action on an unknown task, a non-recurring task, or one the caller may not touch. */
const TASK_NOT_FOUND = 'Task not found';

/** An undo with nothing to undo (legacy answers this for a missing id too). */
const TASK_NOTHING_TO_UNDO = 'Nothing to undo';

const TASKS_ALERT_LINK = '/calendar/tasks';

/**
 * What a mutation answers: the field patch adds the tag set, the three cursor
 * actions answer the bare row (legacy `TaskUpdatedResponse` union).
 */
export type TaskUpdatedRow = TaskRow | (TaskRow & { readonly tags: readonly string[] });

/**
 * The caller's stored IANA zone, or `UTC` when none is stored. ONE home: the
 * cursor's day boundaries and the overdue pin both read the day through it, so
 * a stored zone change moves every task date together.
 */
export async function viewerZone(ctx: Ctx, actor: Actor): Promise<string> {
	return (await getTimeZone(ctx, actor.id)) ?? 'UTC';
}

/** The viewer's family membership of ONE family, the flag `canMutateTask` takes. */
async function isMemberOf(ctx: Ctx, actor: Actor, familyId: string | null): Promise<boolean> {
	if (!familyId) return false;
	return (await listPersonFamilyIds(ctx, actor.id)).includes(familyId);
}

/** The mutation rule with family's membership answer filled in (rule R1: family owns the roster). */
async function canMutateTaskAs(ctx: Ctx, actor: Actor, task: TaskRow): Promise<boolean> {
	if (task.userId === actor.id) return true;
	return canMutateTask(task, actor.id, await isMemberOf(ctx, actor, task.familyId));
}

/** The acting person's first name as an Alert names it (`Someone` when the row has none). */
async function actorNameOf(ctx: Ctx, actor: Actor): Promise<string> {
	const person = await getPerson(ctx, actor);
	return person.firstName || 'Someone';
}

/** Parse a stored instant (a Postgres `mode:'string'` render keeps its own offset). */
function parseInstant(value: string | null | undefined): DateTime | null {
	if (!value) return null;
	const parsed = DateTime.fromISO(value.trim().replace(' ', 'T'), { setZone: true });
	return parsed.isValid ? parsed : null;
}

/**
 * Check a Task off or back on. An OPEN recurring row advances its cursor to
 * the next occurrence and increments `completionCount` (its `completedAt`
 * stays null — the cursor row is never "completed"); every other row toggles
 * `completedAt`. Exactly one history row per actual completion, stamped with
 * the acting user; un-checking deletes nothing (history is append-only).
 *
 * The open → done transition (count-based for a recurring row) writes ONE
 * `task_completed` Alert to the owner when someone else did it, and nothing on
 * an un-check, a lost race, or the owner's own check-off.
 */
export async function toggleTaskCompletion(
	ctx: Ctx,
	actor: Actor,
	input: { readonly taskId: string }
): Promise<TaskRow> {
	const task = await findTask(ctx.db, input.taskId);
	if (!task || !(await canMutateTaskAs(ctx, actor, task))) throw notFound(TASK_NOT_FOUND);

	const updated = await applyToggle(ctx, actor, task);
	const completedNow =
		!task.completedAt &&
		(updated.completedAt !== null ||
			(updated.completionCount ?? 0) > (task.completionCount ?? 0));
	if (completedNow && updated.userId !== actor.id) {
		const actorName = await actorNameOf(ctx, actor);
		await createAlert(ctx, actor, {
			userId: updated.userId,
			type: 'task_completed',
			actorName,
			message: `${actorName} completed '${updated.title}'`,
			link: TASKS_ALERT_LINK
		});
	}
	return updated;
}

/**
 * The recurring-vs-one-off decision (legacy `mutations.applyToggle`) with its
 * write in one transaction. Both guards make a double-tap a no-op: the
 * due-date guard on the advance and the completed-stamp guard on the toggle
 * only match the first request, and only the matching request writes a
 * history row.
 */
async function applyToggle(ctx: Ctx, actor: Actor, task: TaskRow): Promise<TaskRow> {
	const now = ctx.clock.now();
	if (!task.completedAt && task.recurrenceFrequency) {
		const zone = await viewerZone(ctx, actor);
		const next = nextCursorDue(
			task.dueDate,
			task.recurrenceFrequency,
			task.recurrenceInterval,
			now,
			zone
		);
		return await withTx(ctx, async (txCtx) => {
			const advanced = next
				? await advanceCursorGuarded(txCtx.db, {
						taskId: task.id,
						expectedDue: task.dueDate,
						dueDate: next
					})
				: null;
			if (!advanced) return (await findTask(txCtx.db, task.id)) ?? task;
			await insertCompletion(txCtx.db, {
				taskId: advanced.id,
				userId: advanced.userId,
				actorId: actor.id,
				familyId: advanced.familyId ?? null,
				completedAt: now.toISOString()
			});
			return advanced;
		});
	}

	const completing = !task.completedAt;
	return await withTx(ctx, async (txCtx) => {
		const row = await toggleCompletionGuarded(txCtx.db, {
			taskId: task.id,
			completing,
			completedAt: completing ? now.toISOString() : null,
			expectedCompletedAt: task.completedAt
		});
		if (!row) return (await findTask(txCtx.db, task.id)) ?? task;
		if (completing) {
			await insertCompletion(txCtx.db, {
				taskId: row.id,
				userId: row.userId,
				actorId: actor.id,
				familyId: row.familyId ?? null,
				completedAt: now.toISOString()
			});
		}
		return row;
	});
}

/**
 * Skip the current occurrence: move the cursor forward with NO history row and
 * NO count change, and reopen the row (`completedAt: null`, legacy Q-058). A
 * non-recurring row is the same 404 as an unknown one.
 */
export async function skipTaskOccurrence(
	ctx: Ctx,
	actor: Actor,
	input: { readonly taskId: string }
): Promise<TaskRow> {
	const task = await findTask(ctx.db, input.taskId);
	if (!task || !task.recurrenceFrequency || !(await canMutateTaskAs(ctx, actor, task))) {
		throw notFound(TASK_NOT_FOUND);
	}
	const next = nextCursorDue(
		task.dueDate,
		task.recurrenceFrequency,
		task.recurrenceInterval,
		ctx.clock.now(),
		await viewerZone(ctx, actor)
	);
	if (!next) throw new Error('skipTaskOccurrence: nextCursorDue returned null for a stored frequency');
	return (await skipCursor(ctx.db, { taskId: task.id, dueDate: next })) ?? task;
}

/**
 * Reverse the last check-off of a Recurring Task: restore the previous cursor,
 * decrement the tally (never below zero) and delete the latest history row, so
 * stats and the streak stop counting the undone completion. The client's
 * `previousDueDate` is only a hint — accepted when it parses and is strictly
 * before the current due, otherwise the previous cursor is derived from the
 * task's own schedule, anchored on the latest completion instant.
 *
 * A double-tap on undo finds `completionCount = 0`, matches nothing and
 * answers `Nothing to undo`.
 */
export async function undoTaskCompletion(
	ctx: Ctx,
	actor: Actor,
	input: { readonly taskId: string; readonly previousDueDate?: string | null }
): Promise<TaskRow> {
	const task = await findTask(ctx.db, input.taskId);
	if (!task || !task.recurrenceFrequency || !(await canMutateTaskAs(ctx, actor, task))) {
		throw notFound(TASK_NOTHING_TO_UNDO);
	}
	const now = ctx.clock.now();
	const frequency = task.recurrenceFrequency;

	const previous = await withTx(ctx, async (txCtx) => {
		const latest = await findLatestCompletion(txCtx.db, task.id);
		const hint = parseInstant(input.previousDueDate ?? null);
		const current = parseInstant(task.dueDate);
		const restored =
			hint && current && hint < current
				? hint.toISO()
				: derivePreviousDue(
						task.dueDate,
						frequency,
						task.recurrenceInterval,
						latest?.completedAt ?? null,
						now
					);
		if (!restored) return null;
		const row = await rewindCursorGuarded(txCtx.db, { taskId: task.id, dueDate: restored });
		if (!row) return null;
		if (latest) await deleteCompletionById(txCtx.db, latest.id);
		return row;
	});
	if (!previous) throw notFound(TASK_NOTHING_TO_UNDO);
	return previous;
}
