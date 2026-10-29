import { json } from '@sveltejs/kit';
import { and, asc, eq, lt } from 'drizzle-orm';
import { apiError } from '$lib/server/utils/apiError';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { db } from '$lib/server/db';
import { taskfocusCommands, tasks } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/**
 * TaskFocus device command channel (021): a phone enqueues start/stop; the
 * desktop pulls the oldest first (FIFO) and acks by DELETE (idempotent).
 * Same Bearer/session auth as every /api route (hooks.server.ts).
 */

/** Hygiene window: a command older than this never reaches the desktop. */
const COMMAND_MAX_AGE_MS = 10 * 60 * 1000;

/** Small FIFO slice, per the spec ("or a small FIFO list"). */
const MAX_COMMANDS = 25;

function isCommand(v: unknown): v is 'start' | 'stop' {
	return v === 'start' || v === 'stop';
}

export const GET: RequestHandler = async ({ locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;

	try {
		// Hygiene: stale commands drop on read (the desktop also checks age
		// before acting — this keeps the queue from rotting, per the spec).
		await db
			.delete(taskfocusCommands)
			.where(
				and(
					eq(taskfocusCommands.userId, auth.user.id),
					lt(taskfocusCommands.issuedAt, new Date(Date.now() - COMMAND_MAX_AGE_MS))
				)
			);

		const commands = await db
			.select()
			.from(taskfocusCommands)
			.where(eq(taskfocusCommands.userId, auth.user.id))
			.orderBy(asc(taskfocusCommands.issuedAt), asc(taskfocusCommands.id))
			.limit(MAX_COMMANDS);

		return json({
			commands: commands.map((c) => ({
				id: c.id,
				command: c.command,
				taskId: c.taskId,
				issuedAt: c.issuedAt.toISOString()
			}))
		});
	} catch (error) {
		console.error('Failed to read commands:', error);
		return apiError('/api/taskfocus/commands', 500, 'Failed to read commands', auth.user.id);
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;

	try {
		const body = await request.json();
		if (!isCommand(body.command)) {
			return json({ error: "Command must be 'start' or 'stop'" }, { status: 400 });
		}

		let taskId: string | null = null;
		if (body.taskId !== undefined && body.taskId !== null) {
			if (typeof body.taskId !== 'string' || body.taskId.length === 0) {
				return json({ error: 'Invalid taskId' }, { status: 400 });
			}
			// A start must name one of the user's own tasks — the token's user
			// can only ever command their own queue.
			const [task] = await db.select().from(tasks).where(eq(tasks.id, body.taskId));
			if (!task || task.userId !== auth.user.id) {
				return json({ error: 'Task not found' }, { status: 400 });
			}
			taskId = body.taskId;
		} else if (body.command === 'start') {
			return json({ error: 'taskId is required for start' }, { status: 400 });
		}

		const [created] = await db
			.insert(taskfocusCommands)
			.values({ userId: auth.user.id, command: body.command, taskId })
			.returning();

		return json(
			{
				id: created.id,
				command: created.command,
				taskId: created.taskId,
				issuedAt: created.issuedAt.toISOString()
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error('Failed to enqueue command:', error);
		return apiError('/api/taskfocus/commands', 500, 'Failed to enqueue command', auth.user.id);
	}
};
