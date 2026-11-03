import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadBugReports, requireAdminJson } from '$lib/server/services/adminData';
import { formatBugReportsExport } from '$lib/admin/export';

/**
 * GET /api/admin/bugs (#292 G19) — the /admin/bugs register: open +
 * resolved reports with reporter names, and the page's plain-text export
 * of the open ones.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const auth = requireAdminJson(locals);
	if (auth.response) return auth.response;
	const data = await loadBugReports();
	return json({ ...data, exportText: formatBugReportsExport(data.open) });
};
