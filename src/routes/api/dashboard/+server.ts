import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { loadUserScope } from '$lib/server/services/userScope';
import { loadDashboard } from '$lib/server/services/dashboardData';

/**
 * GET /api/dashboard?date=YYYY-MM-DD (#292 G8) — the Day Dashboard loader
 * verbatim (loadDashboard), with the page's streamed `dashboardData`
 * resolved into `data`. The page's load warnings and the streamed legs'
 * warnings are merged into one `warnings` list.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const dateParam = url.searchParams.get('date');
	if (dateParam !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
		return json({ error: 'Invalid date' }, { status: 400 });
	}
	const userId = auth.user.id;
	const scope = await loadUserScope(userId);
	const page = await loadDashboard({ userId, ...scope, dateParam });
	const { warnings: dataWarnings, ...data } = await page.dashboardData;
	return json({
		zone: page.zone,
		dayISO: page.dayISO,
		isToday: page.isToday,
		meId: page.meId,
		familyId: page.familyId,
		modules: page.modules,
		dailyVerse: page.dailyVerse,
		taskCategories: page.taskCategories,
		data,
		warnings: [...page.loadWarnings, ...dataWarnings]
	});
};
