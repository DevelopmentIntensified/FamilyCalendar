import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import { requireUserJson } from '$lib/server/utils/requireUser';
import {
	deletePhoneSession,
	endPhoneSession,
	toSessionDto
} from '$lib/server/db/actions/taskfocusSessions';
import type { RequestHandler } from './$types';

/**
 * One phone focus session (#293). Another user's id is indistinguishable
 * from an unknown one (404).
 */

/** Stop: `{endedAt}` closes the session. 409 once the desktop absorbed it. */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
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
		// SAFETY: SvelteKit fills params.id for a [id] route; body is a
		// non-null, non-array object (checked above), parsed by the domain fn.
		// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- raw JSON body handed to its boundary parser.
		const result = await endPhoneSession(auth.user.id, params.id!, body as Record<string, unknown>);
		switch (result.kind) {
			case 'invalid':
				return json({ error: result.error }, { status: 400 });
			case 'not_found':
				return json({ error: 'Session not found' }, { status: 404 });
			case 'absorbed':
				return json({ error: 'Session already absorbed' }, { status: 409 });
			case 'ended':
				return json({ session: toSessionDto(result.session) });
		}
	} catch (error) {
		console.error('Failed to end focus session:', error);
		return apiError(
			'/api/taskfocus/sessions/:id',
			500,
			'Failed to end focus session',
			auth.user.id
		);
	}
};

/** Discard (user cancelled). 404 = already gone; clients treat it as done. */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;

	try {
		// SAFETY: SvelteKit fills params.id for a [id] route.
		const result = await deletePhoneSession(auth.user.id, params.id!);
		if (result === 'not_found') return json({ error: 'Session not found' }, { status: 404 });
		if (result === 'absorbed') return json({ error: 'Session already absorbed' }, { status: 409 });
		return json({ success: true });
	} catch (error) {
		console.error('Failed to delete focus session:', error);
		return apiError(
			'/api/taskfocus/sessions/:id',
			500,
			'Failed to delete focus session',
			auth.user.id
		);
	}
};
