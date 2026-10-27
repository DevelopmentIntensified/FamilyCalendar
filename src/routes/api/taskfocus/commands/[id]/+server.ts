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
		const id = params.id;
		if (!id) return new Response(null, { status: 204 });
		await db
			.delete(taskfocusCommands)
			.where(and(eq(taskfocusCommands.id, id), eq(taskfocusCommands.userId, auth.user.id)));
		return new Response(null, { status: 204 });
	} catch (error) {
		console.error('Failed to ack command:', error);
		return apiError('/api/taskfocus/commands/:id', 500, 'Failed to ack command', auth.user?.id ?? null);
	}
};
