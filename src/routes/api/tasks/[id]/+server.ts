import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateTask, toggleTaskComplete, deleteTask, TASK_FREQUENCIES } from '$lib/server/db/actions/tasks';

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
			const frequency =
				body.recurrenceFrequency === null || TASK_FREQUENCIES.includes(body.recurrenceFrequency)
					? body.recurrenceFrequency
					: undefined;

			// Assignment transitions. Only the assignee may accept; declining
			// releases the task back to the pool.
			let assignmentPatch: { assignedTo?: string | null; assignmentStatus?: string | null } = {};
			if (body.assignedTo === null) {
				assignmentPatch = { assignedTo: null, assignmentStatus: 'none' };
			} else if (typeof body.assignedTo === 'string' && body.assignedTo) {
				assignmentPatch = {
					assignedTo: body.assignedTo,
					assignmentStatus:
						body.assignedTo === locals.user.id ? 'accepted' : 'pending'
				};
			} else if (body.assignmentStatus === 'accepted') {
				assignmentPatch = { assignmentStatus: 'accepted' };
			} else if (body.assignmentStatus === 'declined') {
				assignmentPatch = { assignedTo: null, assignmentStatus: 'none' };
			}

			updated = await updateTask(taskId, locals.user.id, {
				title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : undefined,
				notes: body.notes === undefined ? undefined : body.notes,
				dueDate: body.dueDate === undefined ? undefined : body.dueDate || null,
				recurrenceFrequency: frequency,
				recurrenceInterval:
					frequency === null ? null : frequency ? Math.max(1, Math.floor(body.recurrenceInterval ?? 1)) : undefined,
				completedAt: body.completedAt,
				...assignmentPatch
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
