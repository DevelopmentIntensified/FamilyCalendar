import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { loadFamilyTasks } from '$lib/server/services/familyData';

/**
 * GET /api/families/{id}/tasks (#292 G11) — the /family/tasks board for ONE
 * family (loadFamilyTasks). Not a member → 404.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;
	const board = await loadFamilyTasks(auth.user.id, params.id);
	if (!board || board.familyId !== params.id) {
		return json({ error: 'Family not found' }, { status: 404 });
	}
	return json({
		tasks: board.tasks,
		publicTasks: board.publicTasks,
		familyRoster: board.familyRoster,
		taskCategories: board.taskCategories
	});
};
