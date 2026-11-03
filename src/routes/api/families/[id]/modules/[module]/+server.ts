import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { toggleDashboardModule } from '$lib/server/services/familyData';
import { readJsonObject } from '$lib/server/utils/jsonBody';

/**
 * PUT /api/families/{id}/modules/{module} `{enabled:boolean}` (#292 G10b) —
 * a family Dashboard Module master switch; the page's toggleDashboardModule.
 */
export const PUT: RequestHandler = async ({ locals, params, request }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const body = await readJsonObject(request);
	if (!body.ok) return body.response;
	if (typeof body.value.enabled !== 'boolean') {
		return json({ error: 'enabled must be a boolean' }, { status: 400 });
	}
	const r = await toggleDashboardModule(auth.user.id, params.id, params.module, body.value.enabled);
	if (!r.ok) return json({ error: r.error }, { status: r.status });
	return json({ success: true });
};
