/**
 * tasks focus services: the TaskFocus device command FIFO, the phone focus
 * sessions and the overlay `listTasks` paints on every list row.
 *
 * Authorization and scoping live here: every command and session call is the
 * caller's own (`actor.id`), so another user's id answers exactly like an
 * unknown one. Time comes from `ctx.clock` (rule R5); the time BOUNDS are the
 * pure rules in `tasks.focus.rules.ts`.
 *
 * The command channel is a per-user FIFO: rows older than 10 minutes are
 * dropped on read and one read is capped at 25 (Q-057 keeps the cap). The
 * phone's one-open-session invariant is enforced by the partial unique index,
 * so a concurrent start answers the same 409 as a sequential one.
 *
 * Legacy homes: `server/db/actions/taskfocusSessions.ts` (session math + store),
 * `routes/api/taskfocus/**` (the refusals).
 *
 * Doc: ./README.md#invariants
 */
import type { Actor } from '$lib/kernel/ctx/actor';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { conflict, invalid, notFound } from '$lib/kernel/errors/appError';
import type { TaskfocusCommandRow, TaskfocusSessionRow } from '$lib/kernel/db/tables.server';
import { listPersonFamilyIds } from '$lib/domains/family/index.server';
import {
	FOCUS_SESSION_ABSORBED,
	FOCUS_SESSION_NOT_FOUND,
	FOCUS_SESSION_OPEN,
	FOCUS_SESSION_RUNNING
} from './tasks.contract';
import {
	FOCUS_COMMAND_MAX_AGE_MS,
	FOCUS_COMMAND_PAGE_SIZE,
	UNABSORBED_LIMIT,
	sessionDurationError,
	sessionTimesError,
	summarizePhoneFocus,
	type TaskPhoneFocus
} from './tasks.focus.rules';
import {
	absorbSession,
	ackCommand,
	deleteStaleCommands,
	deleteUnabsorbedSession,
	findOpenSession,
	findSession,
	insertCommand,
	insertFocusSession,
	listClosedUnabsorbedSessions,
	listCommands,
	listUnabsorbedSessions,
	setSessionEndedAt
} from './tasks.focus.repo.server';
import { findTask } from './tasks.repo.server';
import { canMutateTask } from './tasks.task.rules';

/** `POST /api/taskfocus/commands` after the contract parsed the body. */
export type FocusCommandInput = {
	/** `start` needs a task; `stop` may carry none. */
	readonly command: 'start' | 'stop';
	readonly taskId: string | null;
};

/** `POST /api/taskfocus/sessions` after the contract parsed the instants. */
export type FocusSessionStartInput = {
	readonly taskId: string;
	readonly startedAt: Date;
	/** `null` records a session that is still running. */
	readonly endedAt: Date | null;
};

/** `PATCH /api/taskfocus/sessions/[id]` (a retried stop overwrites `endedAt`). */
export type FocusSessionEndInput = {
	readonly id: string;
	readonly endedAt: Date;
};

/**
 * The Task a session may be attached to: it exists, is not archived, and the
 * caller may mutate it (legacy `canSeeTask` — the same door as
 * `PUT /api/tasks/[id]`). `null` is the wire's `404 Task not found`.
 */
async function mutableTask(ctx: Ctx, actor: Actor, taskId: string): Promise<string | null> {
	const task = await findTask(ctx.db, taskId);
	if (!task || task.archivedAt) return null;
	const isFamilyMember =
		task.familyId !== null && (await listPersonFamilyIds(ctx, actor.id)).includes(task.familyId);
	return canMutateTask(task, actor.id, isFamilyMember) ? task.id : null;
}

// --- Device commands --------------------------------------------------------

/**
 * The caller's queue, oldest first, at most 25 rows: stale rows (> 10 min)
 * are deleted first, exactly as the legacy read did (#021).
 */
export async function listFocusCommands(ctx: Ctx, actor: Actor): Promise<TaskfocusCommandRow[]> {
	await deleteStaleCommands(ctx.db, {
		userId: actor.id,
		cutoff: new Date(ctx.clock.now().getTime() - FOCUS_COMMAND_MAX_AGE_MS)
	});
	return await listCommands(ctx.db, { userId: actor.id, limit: FOCUS_COMMAND_PAGE_SIZE });
}

/**
 * Enqueue one command. A `taskId` names a Task the caller OWNS (the legacy
 * gate, kept for `stop` too per Q-056's open question); a missing or foreign
 * one answers `400 Task not found`, not a 404 — the device channel's contract.
 */
export async function issueFocusCommand(
	ctx: Ctx,
	actor: Actor,
	input: FocusCommandInput
): Promise<TaskfocusCommandRow> {
	let taskId: string | null = null;
	if (input.taskId !== null) {
		const task = await findTask(ctx.db, input.taskId);
		if (!task || task.userId !== actor.id) throw invalid('Task not found');
		taskId = task.id;
	}
	return await insertCommand(ctx.db, {
		userId: actor.id,
		command: input.command,
		taskId,
		issuedAt: ctx.clock.now()
	});
}

/** Ack one command; a live, unknown, already-acked or foreign id all succeed. */
export async function ackFocusCommand(ctx: Ctx, actor: Actor, id: string): Promise<void> {
	await ackCommand(ctx.db, { userId: actor.id, id });
}

// --- Phone focus sessions ---------------------------------------------------

/**
 * Start (or record offline) one session. Without `endedAt` the caller may have
 * no other running session — a second open start answers
 * `409 { error, openSessionId }`, including when it lost the insert race to
 * the partial unique index. A finished session is never refused for an open
 * one. The task must be mutable by the caller and not archived (`404`).
 */
export async function startFocusSession(
	ctx: Ctx,
	actor: Actor,
	input: FocusSessionStartInput
): Promise<TaskfocusSessionRow> {
	const timesError = sessionTimesError(input.startedAt, input.endedAt, ctx.clock.now());
	if (timesError) throw invalid(timesError);

	const taskId = await mutableTask(ctx, actor, input.taskId);
	if (!taskId) throw notFound('Task not found');

	if (!input.endedAt) {
		const open = await findOpenSession(ctx.db, actor.id);
		if (open) throw conflict(FOCUS_SESSION_RUNNING, { openSessionId: open.id });
	}

	const session = await insertFocusSession(ctx.db, {
		id: ctx.ids.id(),
		userId: actor.id,
		taskId,
		startedAt: input.startedAt,
		endedAt: input.endedAt
	});
	if (session) return session;

	// Lost the one-open-session race: name the winner, as the index sees it.
	const open = await findOpenSession(ctx.db, actor.id);
	throw conflict(FOCUS_SESSION_RUNNING, { openSessionId: open?.id ?? '' });
}

/**
 * Stop (or re-stop) a session: `{endedAt}` must be after the stored start and
 * within 12 hours. An absorbed session is immutable (`409`); another user's
 * id answers `404`. A retried stop overwrites the previous end.
 */
export async function endFocusSession(
	ctx: Ctx,
	actor: Actor,
	input: FocusSessionEndInput
): Promise<TaskfocusSessionRow> {
	const existing = await findSession(ctx.db, { userId: actor.id, id: input.id });
	if (!existing) throw notFound(FOCUS_SESSION_NOT_FOUND);
	if (existing.absorbedAt) throw conflict(FOCUS_SESSION_ABSORBED);

	// A stop checks only the span (legacy `durationError`): the start's clock
	// skew was decided when it was created.
	const timesError = sessionDurationError(existing.startedAt, input.endedAt);
	if (timesError) throw invalid(timesError);

	const session = await setSessionEndedAt(ctx.db, {
		userId: actor.id,
		id: input.id,
		endedAt: input.endedAt
	});
	// Absorbed between the read and the write.
	if (!session) throw conflict(FOCUS_SESSION_ABSORBED);
	return session;
}

/**
 * Discard an unabsorbed session (open or closed). An absent or foreign id is
 * `404 Session not found`; an absorbed one is `409`.
 */
export async function discardFocusSession(ctx: Ctx, actor: Actor, id: string): Promise<void> {
	if (await deleteUnabsorbedSession(ctx.db, { userId: actor.id, id })) return;
	const existing = await findSession(ctx.db, { userId: actor.id, id });
	if (!existing) throw notFound(FOCUS_SESSION_NOT_FOUND);
	throw conflict(FOCUS_SESSION_ABSORBED);
}

/**
 * The desktop's absorb ack: stamps `absorbedAt` on a closed session and is
 * idempotent (a repeat answers the original stamp). A running session is
 * `409 Only closed sessions can be absorbed`.
 */
export async function absorbFocusSession(
	ctx: Ctx,
	actor: Actor,
	id: string
): Promise<TaskfocusSessionRow> {
	const marked = await absorbSession(ctx.db, {
		userId: actor.id,
		id,
		absorbedAt: ctx.clock.now()
	});
	if (marked) return marked;

	const existing = await findSession(ctx.db, { userId: actor.id, id });
	if (!existing) throw notFound(FOCUS_SESSION_NOT_FOUND);
	if (existing.absorbedAt) return existing;
	throw conflict(FOCUS_SESSION_OPEN);
}

/** The desktop's pull: the caller's closed, unabsorbed sessions, oldest first, max 200. */
export async function listUnabsorbedFocusSessions(
	ctx: Ctx,
	actor: Actor
): Promise<TaskfocusSessionRow[]> {
	return await listClosedUnabsorbedSessions(ctx.db, {
		userId: actor.id,
		limit: UNABSORBED_LIMIT
	});
}

/**
 * The phone overlay `listTasks` paints on its rows: whole minutes from the
 * caller's closed unabsorbed sessions (floored once on the SUM) and the start
 * of their running session. Only the caller's sessions count; the desktop's
 * `focusMinutes`/`focusStartedAt` are never touched here.
 */
export async function getPhoneFocusOverlay(
	ctx: Ctx,
	actor: Actor
): Promise<Map<string, TaskPhoneFocus>> {
	return summarizePhoneFocus(await listUnabsorbedSessions(ctx.db, actor.id));
}
