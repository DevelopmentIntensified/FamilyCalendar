import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import { requireUserJson } from '$lib/server/utils/requireUser';
import {
	createPhoneSession,
	listUnabsorbedSessions,
	toSessionDto,
	toUnabsorbedDto
} from '$lib/server/db/actions/taskfocusSessions';
import type { RequestHandler } from './$types';

/**
 * Phone focus sessions (#293, TaskFocus #124). Same Bearer/session auth as
 * /api/tasks (hooks.server.ts); every call is scoped to the caller.
 */

/** Desktop pull: closed + unabsorbed sessions, oldest first, max 200. */
export const GET: RequestHandler = async ({ locals, url }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	if (url.searchParams.get('unabsorbed') !== '1') {
		return json({ error: 'Only ?unabsorbed=1 is supported' }, { status: 400 });
	}
	try {
		const rows = await listUnabsorbedSessions(auth.user.id);
		return json({ sessions: rows.map(toUnabsorbedDto) });
	} catch (error) {
		console.error('Failed to list focus sessions:', error);
		return apiError('/api/taskfocus/sessions', 500, 'Failed to list focus sessions', auth.user.id);
	}
};

/** Phone start (no endedAt) or an offline-recorded finished session. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	// oxlint-disable-next-line anti-slop/no-runtime-typeof -- request-body boundary: reject non-object JSON before field parsing.
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	try {
		// SAFETY: body is a non-null, non-array object (checked above); fields are parsed by the domain function.
		// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- raw JSON body handed to its boundary parser.
		const result = await createPhoneSession(auth.user.id, body as Record<string, unknown>);
		switch (result.kind) {
			case 'invalid':
				return json({ error: result.error }, { status: 400 });
			case 'task_not_found':
				return json({ error: 'Task not found' }, { status: 404 });
			case 'open_exists':
				return json(
					{
						error: 'A phone focus session is already running',
						openSessionId: result.openSessionId
					},
					{ status: 409 }
				);
			case 'created':
				return json({ session: toSessionDto(result.session) }, { status: 201 });
		}
	} catch (error) {
		console.error('Failed to create focus session:', error);
		return apiError('/api/taskfocus/sessions', 500, 'Failed to create focus session', auth.user.id);
	}
};
