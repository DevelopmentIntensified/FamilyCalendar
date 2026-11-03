import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdminJson } from '$lib/server/services/adminData';
import { resolveBugReport } from '$lib/server/db/actions/bugReports';

/** POST /api/admin/bugs/{id}/resolve (#292 G19) — the page's resolve action. */
export const POST: RequestHandler = async ({ locals, params }) => {
	const auth = requireAdminJson(locals);
	if (auth.response) return auth.response;
	const updated = await resolveBugReport(params.id);
	if (!updated) return json({ error: 'Bug report not found' }, { status: 404 });
	return json({ success: true, report: updated });
};
