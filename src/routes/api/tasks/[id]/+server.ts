import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateTask, toggleTaskComplete, deleteTask } from '$lib/server/db/actions/tasks';

export const PUT: RequestHandler = async ({ request, locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const taskId = url.pathname.split('/').pop();
	if (!taskId) {
		return json({ error: 'Task ID required' }, { status: 400 });
	}

	const body = await request.json();

	try {
		let updated;
		if (body.toggleComplete) {
			updated = await toggleTaskComplete(taskId, locals.user.id);
		} else {
			updated = await updateTask(taskId, locals.user.id, {
				title: body.title,
				notes: body.notes,
				dueDate: body.dueDate,
				completedAt: body.completedAt
			});
		}
		if (!updated) {
			return json({ error: 'Task not found' }, { status: 404 });
		}
		return json({ success: true, task: updated });
	} catch (error) {
		console.error('Failed to update task:', error);
		return json({ error: 'Failed to update task' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const taskId = url.pathname.split('/').pop();
	if (!taskId) {
		return json({ error: 'Task ID required' }, { status: 400 });
	}

	try {
		await deleteTask(taskId, locals.user.id);
		return json({ success: true });
	} catch (error) {
		console.error('Failed to delete task:', error);
		return json({ error: 'Failed to delete task' }, { status: 500 });
	}
};
