import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { absorbPhoneSession, toSessionDto } from '$lib/server/db/actions/taskfocusSessions';
import type { RequestHandler } from './$types';

/**
 * Desktop ack after its focusMinutes PUT succeeded (#293). Idempotent:
 * already absorbed -> 200; unknown / another user's -> 404 (done). An open
 * (running) session cannot be absorbed -> 409.
 */
export const POST: RequestHandler = async ({ params, locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;

	try {
		// SAFETY: SvelteKit fills params.id for a [id] route.
		const result = await absorbPhoneSession(auth.user.id, params.id!);
		if (result.kind === 'not_found') return json({ error: 'Session not found' }, { status: 404 });
		if (result.kind === 'open') {
			return json({ error: 'Only closed sessions can be absorbed' }, { status: 409 });
		}
		return json({ session: toSessionDto(result.session) });
	} catch (error) {
		console.error('Failed to absorb focus session:', error);
		return apiError(
			'/api/taskfocus/sessions/:id/absorb',
			500,
			'Failed to absorb focus session',
			auth.user.id
		);
	}
};
