import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { apiError } from '$lib/server/utils/apiError';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { db } from '$lib/server/db';
import { taskfocusCommands } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/**
 * Ack one command after the desktop acted on it. Idempotent: an unknown (or
 * already-acked, or other-user's) id returns 204 the same as a live one —
 * never a 404-only response (device-channel spec).
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;

	try {
		// SAFETY: SvelteKit fills params.id for a [id] route; route-param
		// absence is not a runtime state. The scoped delete makes an unknown
		// or other-user's id indistinguishable from a live one — 204 either
		// way (device-channel spec: idempotent ack, never 404-only).
		await db
			.delete(taskfocusCommands)
			.where(and(eq(taskfocusCommands.id, params.id!), eq(taskfocusCommands.userId, auth.user.id)));
		return new Response(null, { status: 204 });
	} catch (error) {
		console.error('Failed to ack command:', error);
		return apiError('/api/taskfocus/commands/:id', 500, 'Failed to ack command', auth.user.id);
	}
};
