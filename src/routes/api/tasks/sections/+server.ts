import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { getUserZone } from '$lib/server/utils/userTimezone';
import { loadTaskSections } from '$lib/server/services/tasksData';

/**
 * GET /api/tasks/sections (#292 G9) — the /calendar/tasks page's sectioned
 * lists (My tasks / To accept / Requested), via the page's own
 * loadTaskSections. Legs degrade to [] + a warning label, never a 500.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const uid = auth.user.id;
	const [familyId, zone] = await Promise.all([getUserFamilyId(uid), getUserZone(uid)]);
	const lists = await loadTaskSections(uid, familyId, zone ?? 'UTC');
	return json({
		myTasks: lists.myTasks,
		pendingAssignments: lists.pendingAssignments,
		requestedByMe: lists.requestedByMe,
		warnings: lists.warnings
	});
};
