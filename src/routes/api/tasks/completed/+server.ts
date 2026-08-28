import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteCompletedTasks } from '$lib/server/db/actions/tasks';

/** Archives (clears) every completed task for the current user — rows are
 *  kept so task stats and streak history survive the clear. */
export const DELETE: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	await deleteCompletedTasks(locals.user.id);
	return json({ success: true });
};