import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	updateTask,
	toggleTaskComplete,
	toggleTaskCompleteFamily,
	advanceTaskToNext,
	undoRecurringCompletion,
	updateTaskInFamily,
	deleteTask,
	normalizeTags,
	TASK_FREQUENCIES
} from '$lib/server/db/actions/tasks';
import { TASK_PRIORITIES } from '$lib/server/db/actions/dashboard';
import { db } from '$lib/server/db';
import { tasks, users, familyMembers } from '$lib/server/db/schema';
import { createNotification } from '$lib/server/db/actions/notifications';
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
		const user = locals.user;
		const zone = await getUserZone(user.id);
		let actorNamePromise: Promise<string> | undefined;
		const getActorName = () =>
			(actorNamePromise ??= db
				.select({ firstName: users.firstName })
				.from(users)
				.where(eq(users.id, user.id))
				.then(([row]) => row?.firstName || 'Someone'));
		let updated;
		if (body.undoComplete) {
			// Reverse a Recurring Task check-off. previousDueDate is captured
			// on the client before the completing PUT.
			updated = await undoRecurringCompletion(
				taskId,
				user.id,
				typeof body.previousDueDate === 'string' ? body.previousDueDate : null
			);
			if (!updated) return json({ error: 'Nothing to undo' }, { status: 404 });
		} else if (body.advanceToNext) {
			// Skip the current occurrence of a Recurring Task: roll the
			// cursor forward without checking it off.
			updated = await advanceTaskToNext(taskId, user.id, zone);
		} else if (body.toggleComplete) {
			updated = await toggleTaskComplete(taskId, user.id, zone);
			if (!updated) {
				const familyId = await familyMembership(taskId, user.id);
				if (familyId) updated = await toggleTaskCompleteFamily(taskId, familyId, zone);
			}
			if (updated && updated.userId !== user.id) {
				const actorName = await getActorName();
				await createNotification({
					userId: updated.userId,
					type: 'task_completed',
					actorName,
					message: `${actorName} completed '${updated.title}'`,
					link: '/calendar/tasks'
				});
			}
		} else {
			const frequency =
				body.recurrenceFrequency === null || TASK_FREQUENCIES.includes(body.recurrenceFrequency)
					? body.recurrenceFrequency
					: undefined;

			const priority =
				body.priority === undefined
					? undefined
					: TASK_PRIORITIES.includes(body.priority)
						? body.priority
						: 'normal';

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

			updated = await updateTask(taskId, user.id, {
				title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : undefined,
				notes: body.notes === undefined ? undefined : body.notes,
				dueDate: body.dueDate === undefined ? undefined : body.dueDate || null,
				priority,
				recurrenceFrequency: frequency,
				recurrenceInterval:
					frequency === null ? null : frequency ? Math.max(1, Math.floor(body.recurrenceInterval ?? 1)) : undefined,
				completedAt:
					typeof body.completedAt === 'string' && !isNaN(Date.parse(body.completedAt))
						? body.completedAt
						: undefined,
				...assignmentPatch,
				tags: body.tags === undefined ? undefined : normalizeTags(body.tags)
			});

			// Non-owner family members: assignment responses and tags only.
			if (!updated && (Object.keys(assignmentPatch).length > 0 || body.tags !== undefined)) {
				const familyId = await familyMembership(taskId, user.id);
				if (familyId)
					updated = await updateTaskInFamily(taskId, familyId, {
						...assignmentPatch,
						tags: body.tags === undefined ? undefined : normalizeTags(body.tags)
					});
			}

			const accepted = assignmentPatch.assignmentStatus === 'accepted';
			const declined = body.assignmentStatus === 'declined';
			if (updated && (accepted || declined) && updated.userId !== user.id) {
				const actorName = await getActorName();
				await createNotification({
					userId: updated.userId,
					type: accepted ? 'assignment_accepted' : 'assignment_declined',
					actorName,
					message: accepted
						? `${actorName} accepted '${updated.title}'`
						: `${actorName} declined '${updated.title}'`,
					link: '/calendar/tasks'
				});
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
