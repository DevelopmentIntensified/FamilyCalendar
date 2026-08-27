import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteCompletedTasks } from '$lib/server/db/actions/tasks';

/** Clears every completed task for the current user. */
export const DELETE: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	await deleteCompletedTasks(locals.user.id);
	return json({ success: true });
};