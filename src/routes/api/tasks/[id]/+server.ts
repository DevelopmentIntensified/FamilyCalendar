import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import type { RequestHandler } from './$types';
import {
	updateTask,
	toggleTaskComplete,
	advanceTaskToNext,
	undoRecurringCompletion,
	updateTaskInFamily,
	deleteTask,
	canMutateTask,
	normalizeTags,
	nonOwnerAssignmentPatch,
	isValidAssignee,
	TASK_FREQUENCIES,
	TASK_VISIBILITIES,
	type AssignmentPatch
} from '$lib/server/db/actions/tasks';
import { normalizeTaskPriority } from '$lib/server/db/actions/taskPriority';
import { db } from '$lib/server/db';
import { tasks, users } from '$lib/server/db/schema';
import { createNotification } from '$lib/server/db/actions/notifications';
import { eq } from 'drizzle-orm';
import { getUserZone } from '$lib/server/utils/userTimezone';

/** True for strings (decoded request fields that must be text). */
function isString(v: unknown): v is string {
	return typeof v === 'string';
}

/** True for non-empty strings (decoded request fields that must carry a value). */
function isNonEmptyString(v: unknown): v is string {
	return typeof v === 'string' && v.length > 0;
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
				isString(body.previousDueDate) ? body.previousDueDate : null
			);
			if (!updated) return json({ error: 'Nothing to undo' }, { status: 404 });
		} else if (body.advanceToNext) {
			// Skip the current occurrence of a Recurring Task: roll the
			// cursor forward without checking it off.
			updated = await advanceTaskToNext(taskId, user.id, zone);
		} else if (body.toggleComplete) {
			// Owner, assignee, or any family member may toggle (one seam).
			updated = await toggleTaskComplete(taskId, user.id, zone);
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

			// Task scoping (issue 019): a visibility patch is owner-only and
			// enum-validated. Checked BEFORE any mutation so a non-owner's
			// request can neither change visibility nor ride along with it.
			let visibility: string | undefined;
			if (body.visibility !== undefined) {
				if (!TASK_VISIBILITIES.includes(body.visibility)) {
					return json({ error: 'Invalid visibility' }, { status: 400 });
				}
				const [existing] = await db.select().from(tasks).where(eq(tasks.id, taskId));
				if (!existing) {
					return json({ error: 'Task not found' }, { status: 404 });
				}
				if (existing.userId !== user.id) {
					return json({ error: 'Only the task owner can change visibility' }, { status: 403 });
				}
				visibility = body.visibility;
			}

			const priority =
				body.priority === undefined ? undefined : normalizeTaskPriority(body.priority);

			// Assignment transitions. Only the assignee may accept; declining
			// releases the task back to the pool.
			let assignmentPatch: AssignmentPatch = {};
			if (body.assignedTo === null) {
				assignmentPatch = { assignedTo: null, assignmentStatus: 'none' };
			} else if (isNonEmptyString(body.assignedTo)) {
				// An assignee must be reachable — the creator themself or a
				// member of the task's family — or the task strands as a
				// pending row the assignee can never see.
				if (body.assignedTo !== user.id) {
					const [target] = await db
						.select({ familyId: tasks.familyId })
						.from(tasks)
						.where(eq(tasks.id, taskId));
					if (target && !(await isValidAssignee(user.id, target.familyId, body.assignedTo))) {
						return json({ error: 'Assignee is not a member of this family' }, { status: 400 });
					}
				}
				assignmentPatch = {
					assignedTo: body.assignedTo,
					assignmentStatus: body.assignedTo === locals.user.id ? 'accepted' : 'pending'
				};
			} else if (body.assignmentStatus === 'accepted') {
				assignmentPatch = { assignmentStatus: 'accepted' };
			} else if (body.assignmentStatus === 'declined') {
				assignmentPatch = { assignedTo: null, assignmentStatus: 'none' };
			}

			updated = await updateTask(taskId, user.id, {
				title: isNonEmptyString(body.title) && body.title.trim() ? body.title.trim() : undefined,
				notes: body.notes === undefined ? undefined : body.notes,
				dueDate: body.dueDate === undefined ? undefined : body.dueDate || null,
				priority,
				visibility,
				recurrenceFrequency: frequency,
				recurrenceInterval:
					frequency === null
						? null
						: frequency
							? Math.max(1, Math.floor(body.recurrenceInterval ?? 1))
							: undefined,
				completedAt:
					isString(body.completedAt) && !isNaN(Date.parse(body.completedAt))
						? body.completedAt
						: undefined,
				...assignmentPatch,
				tags: body.tags === undefined ? undefined : normalizeTags(body.tags)
			});

			// Non-owner family members: assignment responses and tags only.
			// Field scope stays narrow (owner-only above); the permission leg
			// goes through the one task-mutation seam. Assignment authority is
			// narrowed further: only the CURRENT assignee may accept or decline
			// their own assignment — reassignment and clearing stay owner-only.
			if (!updated && (Object.keys(assignmentPatch).length > 0 || body.tags !== undefined)) {
				const [existing] = await db.select().from(tasks).where(eq(tasks.id, taskId));
				if (existing?.familyId && (await canMutateTask(existing, user.id))) {
					const scoped = nonOwnerAssignmentPatch(existing, user.id, assignmentPatch);
					if (!scoped) {
						return json({ error: 'You can only respond to your own assignments' }, { status: 403 });
					}
					updated = await updateTaskInFamily(taskId, existing.familyId, {
						...scoped,
						tags: body.tags === undefined ? undefined : normalizeTags(body.tags)
					});
				}
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

			// Owner-initiated reassignment fan-out: the NEW assignee gets a
			// pending notification. (Owner self-assign is 'accepted' and never
			// notifies; only the owner path can reassign, so `updated` landing
			// with the patch's assignee proves the reassignment happened.)
			const pendingAssignee =
				updated &&
				assignmentPatch.assignmentStatus === 'pending' &&
				assignmentPatch.assignedTo &&
				updated.assignedTo === assignmentPatch.assignedTo
					? assignmentPatch.assignedTo
					: null;
			if (updated && pendingAssignee && pendingAssignee !== user.id) {
				const actorName = await getActorName();
				await createNotification({
					userId: pendingAssignee,
					type: 'assignment_pending',
					actorName,
					message: `${actorName} assigned you '${updated.title}'`,
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
		return apiError(
			new URL(request.url).pathname,
			500,
			'Failed to update task',
			locals.user?.id ?? null
		);
	}
};

export const DELETE: RequestHandler = async ({ request, locals, url }) => {
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
		return apiError(
			new URL(request.url).pathname,
			500,
			'Failed to delete task',
			locals.user?.id ?? null
		);
	}
};
