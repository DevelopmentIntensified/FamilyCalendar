/**
 * tasks focus http: the TaskFocus device channel — `/api/taskfocus/commands`
 * (GET/POST, DELETE :id) and `/api/taskfocus/sessions` (GET, POST, PATCH :id,
 * DELETE :id, absorb).
 *
 * The stem is frozen by `tasks.focus.http.db.test.ts` (R13). Reproduces the
 * legacy wire exactly, including the two shapes the channel has:
 * - commands answer their four fields at the TOP level on POST (`201`), while
 *   GET wraps them in `{commands}`;
 * - sessions answer `{session}` with every stamp, while `?unabsorbed=1` items
 *   carry exactly `{id, taskId, startedAt, endedAt, source}`.
 *
 * The body reading is the focus routes' own: legacy caught the parse failure
 * and answered `400 Invalid JSON body` (its copy, never the kernel's), so the
 * contract's `{ error: FOCUS_INVALID_JSON }` object message is the boundary and
 * the mode is `lenient`. K-20 (`malformedBody`) is not in this tree.
 *
 * Doc: ./README.md#public-interface
 */
import type { TaskfocusCommandRow, TaskfocusSessionRow } from '$lib/kernel/db/tables.server';
import { created, endpoint, ok } from '$lib/kernel/http/endpoint.server';
import {
	FocusCommandBody,
	FocusSessionEndBody,
	FocusSessionStartBody,
	FocusSessionsQuery,
	TaskRouteParams,
	type FocusCommandWire,
	type FocusSessionListItemWire,
	type FocusSessionWire
} from './tasks.contract';
import {
	absorbFocusSession,
	ackFocusCommand,
	discardFocusSession,
	endFocusSession,
	issueFocusCommand,
	listFocusCommands,
	listUnabsorbedFocusSessions,
	startFocusSession
} from './tasks.focus.service.server';

/** One queued command as the channel carries it. */
function commandWire(row: TaskfocusCommandRow): FocusCommandWire {
	return {
		id: row.id,
		command: row.command,
		taskId: row.taskId,
		issuedAt: row.issuedAt.toISOString()
	};
}

/** One phone session, every stamp included (POST, PATCH, absorb). */
function sessionWire(row: TaskfocusSessionRow): FocusSessionWire {
	return {
		id: row.id,
		taskId: row.taskId,
		startedAt: row.startedAt.toISOString(),
		endedAt: row.endedAt ? row.endedAt.toISOString() : null,
		source: row.source,
		absorbedAt: row.absorbedAt ? row.absorbedAt.toISOString() : null,
		createdAt: row.createdAt.toISOString()
	};
}

/** The desktop pull's shorter item: five fields, no absorb stamp. */
function unabsorbedWire(row: TaskfocusSessionRow): FocusSessionListItemWire {
	return {
		id: row.id,
		taskId: row.taskId,
		startedAt: row.startedAt.toISOString(),
		endedAt: row.endedAt ? row.endedAt.toISOString() : null,
		source: row.source
	};
}

// --- Commands -----------------------------------------------------------------

/** `GET /api/taskfocus/commands`: oldest first, ≤ 25, stale rows dropped first. */
export const listFocusCommandsEndpoint = endpoint({
	auth: 'user',
	handle: async ({ ctx, actor }) =>
		ok({ commands: (await listFocusCommands(ctx, actor)).map(commandWire) })
});

/** `POST /api/taskfocus/commands`: a `start|stop` command, 201 with its four fields. */
export const issueFocusCommandEndpoint = endpoint({
	auth: 'user',
	body: FocusCommandBody,
	bodyMode: 'lenient',
	failMessage: 'Failed to enqueue command',
	handle: async ({ ctx, actor, body }) =>
		created(commandWire(await issueFocusCommand(ctx, actor, body)))
});

/** `DELETE /api/taskfocus/commands/[id]`: always 204, foreign ids included. */
export const ackFocusCommandEndpoint = endpoint({
	auth: 'user',
	params: TaskRouteParams,
	failMessage: 'Failed to ack command',
	handle: async ({ ctx, actor, params }) => {
		await ackFocusCommand(ctx, actor, params.id);
		return new Response(null, { status: 204 });
	}
});

// --- Phone sessions -----------------------------------------------------------

/** `GET /api/taskfocus/sessions?unabsorbed=1`: the caller's closed, unabsorbed rows. */
export const listFocusSessionsEndpoint = endpoint({
	auth: 'user',
	query: FocusSessionsQuery,
	handle: async ({ ctx, actor }) => {
		const rows = await listUnabsorbedFocusSessions(ctx, actor);
		return ok({ sessions: rows.map(unabsorbedWire) });
	}
});

/** `POST /api/taskfocus/sessions`: start an open session or record a finished one. */
export const startFocusSessionEndpoint = endpoint({
	auth: 'user',
	body: FocusSessionStartBody,
	bodyMode: 'lenient',
	failMessage: 'Failed to create focus session',
	handle: async ({ ctx, actor, body }) =>
		created({ session: sessionWire(await startFocusSession(ctx, actor, body)) })
});

/** `PATCH /api/taskfocus/sessions/[id] {endedAt}`: stop; a retry overwrites the end. */
export const endFocusSessionEndpoint = endpoint({
	auth: 'user',
	params: TaskRouteParams,
	body: FocusSessionEndBody,
	bodyMode: 'lenient',
	failMessage: 'Failed to end focus session',
	handle: async ({ ctx, actor, params, body }) =>
		ok({
			session: sessionWire(
				await endFocusSession(ctx, actor, {
					id: params.id,
					endedAt: body.endedAt
				})
			)
		})
});

/** `DELETE /api/taskfocus/sessions/[id]`: discards an unabsorbed session. */
export const discardFocusSessionEndpoint = endpoint({
	auth: 'user',
	params: TaskRouteParams,
	failMessage: 'Failed to delete focus session',
	handle: async ({ ctx, actor, params }) => {
		await discardFocusSession(ctx, actor, params.id);
		return ok({ success: true });
	}
});

/** `POST /api/taskfocus/sessions/[id]/absorb`: idempotent ack of a closed session. */
export const absorbFocusSessionEndpoint = endpoint({
	auth: 'user',
	params: TaskRouteParams,
	failMessage: 'Failed to absorb focus session',
	handle: async ({ ctx, actor, params }) =>
		ok({
			session: sessionWire(await absorbFocusSession(ctx, actor, params.id))
		})
});
