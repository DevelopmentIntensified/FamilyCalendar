import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { loadPrintMonth } from '$lib/server/services/printData';

/**
 * GET /api/print?year=YYYY&month=M (#292 G18) — the printable month grid
 * the /calendar/print page renders (loadPrintMonth); the app lays it out and
 * prints natively.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	return json(
		await loadPrintMonth(auth.user.id, url.searchParams.get('year'), url.searchParams.get('month'))
	);
};
