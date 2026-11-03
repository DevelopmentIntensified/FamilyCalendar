import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadUnmatchedPhrases, requireAdminJson } from '$lib/server/services/adminData';
import { formatUnmatchedPhrasesExport } from '$lib/admin/export';

/**
 * GET /api/admin/nlp (#292 G19) — the /admin/nlp register of phrases the
 * parser could not match: open + resolved, and the page's plain-text export
 * of the open ones.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const auth = requireAdminJson(locals);
	if (auth.response) return auth.response;
	const data = await loadUnmatchedPhrases();
	return json({ ...data, exportText: formatUnmatchedPhrasesExport(data.phrases) });
};
