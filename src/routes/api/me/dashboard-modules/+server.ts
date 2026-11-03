import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { readJsonObject } from '$lib/server/utils/jsonBody';
import { DASHBOARD_MODULES } from '$lib/dashboardModules';
import { saveDashboardModules } from '$lib/server/services/accountData';

/**
 * PUT /api/me/dashboard-modules `{hidden: string[]}` (#292 G14) — your own
 * hidden Dashboard Modules (the account page's saveDashboardModules). Only
 * canonical module ids are stored, like the form.
 */
export const PUT: RequestHandler = async ({ locals, request }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const body = await readJsonObject(request);
	if (!body.ok) return body.response;
	const hidden = body.value.hidden;
	if (!Array.isArray(hidden) || hidden.some((h) => typeof h !== 'string')) {
		return json({ error: 'hidden must be an array of module ids' }, { status: 400 });
	}
	const canonical = DASHBOARD_MODULES.map((m) => m.id).filter((id) => hidden.includes(id));
	const r = await saveDashboardModules(auth.user.id, canonical);
	if (!r.ok) return json({ error: r.message }, { status: r.status });
	return json({ success: true, message: r.message, hidden: canonical });
};
