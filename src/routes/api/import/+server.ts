import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { listImportCalendars } from '$lib/server/services/icsImportFlow';

/** GET /api/import (#292 G17) — the calendars you may import into (the page's picker). */
export const GET: RequestHandler = async ({ locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	return json({ calendars: await listImportCalendars(auth.user.id) });
};
