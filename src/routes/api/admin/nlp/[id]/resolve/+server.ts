import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdminJson } from '$lib/server/services/adminData';
import { resolveUnmatchedPhrase } from '$lib/server/db/actions/unmatchedPhrases';

/** POST /api/admin/nlp/{id}/resolve (#292 G19) — the page's resolve action. */
export const POST: RequestHandler = async ({ locals, params }) => {
	const auth = requireAdminJson(locals);
	if (auth.response) return auth.response;
	const updated = await resolveUnmatchedPhrase(params.id);
	if (!updated) return json({ error: 'Phrase not found' }, { status: 404 });
	return json({ success: true, phrase: updated });
};
