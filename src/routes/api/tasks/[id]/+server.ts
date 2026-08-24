import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	updateTask,
	toggleTaskComplete,
	toggleTaskCompleteFamily,
	updateTaskInFamily,
	deleteTask,
	TASK_FREQUENCIES
} from '$lib/server/db/actions/tasks';
import { db } from '$lib/server/db';
import { tasks, familyMembers } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserZone } from '$lib/server/utils/userTimezone';

/** Family membership grants toggle rights on family tasks. */
async function familyMembership(taskId: string, userId: string): Promise<string | null> {
	const [task] = await db
		.select({ familyId: tasks.familyId })
		.from(tasks)
		.where(eq(tasks.id, taskId));
	if (!task?.familyId) return null;
	const [member] = await db
		.select({ familyId: familyMembers.familyId })
		.from(familyMembers)
		.where(and(eq(familyMembers.userId, userId), eq(familyMembers.familyId, task.familyId)));
	return member ? task.familyId : null;
}

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
		const zone = await getUserZone(locals.user.id);
		let updated;
		if (body.toggleComplete) {
			updated = await toggleTaskComplete(taskId, locals.user.id, zone);
			if (!updated) {
				const familyId = await familyMembership(taskId, locals.user.id);
				if (familyId) updated = await toggleTaskCompleteFamily(taskId, familyId, zone);
			}
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
				completedAt:
					typeof body.completedAt === 'string' && !isNaN(Date.parse(body.completedAt))
						? body.completedAt
						: undefined,
				...assignmentPatch
			});

			// Non-owner family members: assignment responses only.
			if (!updated && Object.keys(assignmentPatch).length > 0) {
				const familyId = await familyMembership(taskId, locals.user.id);
				if (familyId) updated = await updateTaskInFamily(taskId, familyId, assignmentPatch);
			}
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
