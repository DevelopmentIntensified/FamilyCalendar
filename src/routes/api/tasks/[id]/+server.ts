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
	type AssignmentPatch,
	type TaskFieldPatch,
	type TaskFrequency
} from '$lib/server/db/actions/tasks';
import { normalizeTaskPriority } from '$lib/server/db/actions/taskPriority';
import { ensureTaskCategory, parseTaskCategory } from '$lib/server/db/actions/taskCategories';
import { db } from '$lib/server/db';
import { tasks, users, type Task } from '$lib/server/db/schema';
import { createNotification } from '$lib/server/db/actions/notifications';
import { eq } from 'drizzle-orm';
import { getUserZone } from '$lib/server/utils/userTimezone';
import { parseFocusStartedAt } from '$lib/server/utils/focusStartedAt';

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
			// The pre-toggle row decides the direction (#229): only an
			// open -> done transition notifies — an un-check, or a double-tap
			// whose guarded update matched nothing, stays silent.
			const [before] = await db.select().from(tasks).where(eq(tasks.id, taskId));
			updated = await toggleTaskComplete(taskId, user.id, zone);
			const completedNow =
				!!before &&
				!!updated &&
				!before.completedAt &&
				(updated.completedAt !== null ||
					(updated.completionCount ?? 0) > (before.completionCount ?? 0));
			if (updated && completedNow && updated.userId !== user.id) {
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
			// One cached read of the stored row, shared by every check below.
			let existingPromise: Promise<Task | undefined> | undefined;
			const loadExisting = () =>
				(existingPromise ??= db
					.select()
					.from(tasks)
					.where(eq(tasks.id, taskId))
					.then(([row]) => row));

			// Recurrence (#231): an unknown frequency is a 400, never a silent
			// no-op. The interval may be patched alone when the STORED task
			// is recurring; with a new frequency it rides along (default 1);
			// clearing the frequency clears it.
			let frequency: TaskFrequency | null | undefined;
			if (body.recurrenceFrequency !== undefined) {
				if (body.recurrenceFrequency !== null && !TASK_FREQUENCIES.includes(body.recurrenceFrequency)) {
					return json({ error: 'Invalid recurrenceFrequency' }, { status: 400 });
				}
				frequency = body.recurrenceFrequency;
			}
			const rawInterval = body.recurrenceInterval;
			if (
				rawInterval !== undefined &&
				rawInterval !== null &&
				(typeof rawInterval !== 'number' || !Number.isFinite(rawInterval))
			) {
				return json({ error: 'Invalid recurrenceInterval' }, { status: 400 });
			}
			const toInterval = (n: number | null | undefined) => Math.max(1, Math.floor(n ?? 1));
			let recurrenceInterval: number | null | undefined;
			if (frequency === null) recurrenceInterval = null;
			else if (frequency) recurrenceInterval = toInterval(rawInterval);
			else if (typeof rawInterval === 'number' && (await loadExisting())?.recurrenceFrequency) {
				recurrenceInterval = toInterval(rawInterval);
			}

			// Task scoping (issue 019): a visibility patch is owner-only and
			// enum-validated. Checked BEFORE any mutation so a non-owner's
			// request can neither change visibility nor ride along with it.
			let visibility: string | undefined;
			if (body.visibility !== undefined) {
				if (!TASK_VISIBILITIES.includes(body.visibility)) {
					return json({ error: 'Invalid visibility' }, { status: 400 });
				}
				const existing = await loadExisting();
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
			} else if (
				isNonEmptyString(body.assignedTo) &&
				(await loadExisting())?.assignedTo === body.assignedTo
			) {
				// Unchanged assignee (#233): edit dialogs re-send the current
				// value on every save. Not an assignment change — it must not
				// 403 the accepted assignee, nor reset an accepted row to
				// pending (and re-notify) when the owner saves.
			} else if (isNonEmptyString(body.assignedTo)) {
				// An assignee must be reachable — the creator themself or a
				// member of the task's family — or the task strands as a
				// pending row the assignee can never see.
				if (body.assignedTo !== user.id) {
					const target = await loadExisting();
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

			// TaskFocus (device-channel spec): absent/null = UNCHANGED (the
			// phone PUTs edits without knowing this field — a wipe-on-absent
			// would erase accrued time on every phone edit). An explicit
			// whole-minutes value >= 0 overwrites; anything else is rejected
			// BEFORE any mutation, like visibility above.
			let focusMinutes: number | undefined;
			if (body.focusMinutes !== undefined && body.focusMinutes !== null) {
				if (
					typeof body.focusMinutes !== 'number' ||
					!Number.isInteger(body.focusMinutes) ||
					body.focusMinutes < 0
				) {
					return json({ error: 'Invalid focusMinutes' }, { status: 400 });
				}
				focusMinutes = body.focusMinutes;
			}
			// 022: field present = overwrite (explicit null = "stopped"), field
			// absent = unchanged. Validated before any mutation.
			const focusStartedAt = parseFocusStartedAt(body);
			if (!focusStartedAt.ok) {
				return json({ error: 'Invalid focusStartedAt' }, { status: 400 });
			}
			// #280: category — absent = unchanged, null/blank = clear, string =
			// set. Validated before any mutation; a set name joins the CALLER's
			// list (stored in the list's spelling for a case variant).
			let category: string | null | undefined;
			if (body.category !== undefined) {
				const parsed = parseTaskCategory(body.category);
				if (!parsed.ok) {
					return json({ error: parsed.error }, { status: 400 });
				}
				category = parsed.value
					? (await ensureTaskCategory(user.id, parsed.value)).name
					: null;
			}

			// Plain fields any permitted caller may edit (visibility and the
			// assignment patch are layered per caller below).
			const fieldPatch: Omit<TaskFieldPatch, 'visibility' | 'assignedTo' | 'assignmentStatus'> = {
				title: isNonEmptyString(body.title) && body.title.trim() ? body.title.trim() : undefined,
				notes: body.notes === undefined ? undefined : body.notes,
				dueDate: body.dueDate === undefined ? undefined : body.dueDate || null,
				priority,
				recurrenceFrequency: frequency,
				recurrenceInterval,
				completedAt:
					isString(body.completedAt) && !isNaN(Date.parse(body.completedAt))
						? body.completedAt
						: undefined,
				focusMinutes,
				focusStartedAt: focusStartedAt.value,
				category,
				tags: body.tags === undefined ? undefined : normalizeTags(body.tags)
			};

			updated = await updateTask(taskId, user.id, {
				...fieldPatch,
				visibility,
				...assignmentPatch
			});

			// Non-owner collaborators (#232): the spec lets any family member,
			// or a live assignee, mutate the task — plain fields and tags via
			// the collaborator write, permission through the one
			// task-mutation seam. Visibility stays owner-only (403'd above);
			// assignment authority is narrower still: only the CURRENT
			// assignee may accept or decline — reassignment and clearing stay
			// owner-only. No rights -> 404 (same as an unknown id).
			if (!updated) {
				const existing = await loadExisting();
				if (
					existing &&
					existing.userId !== user.id &&
					(await canMutateTask(existing, user.id))
				) {
					const scoped = nonOwnerAssignmentPatch(existing, user.id, assignmentPatch);
					if (!scoped) {
						return json({ error: 'You can only respond to your own assignments' }, { status: 403 });
					}
					updated = await updateTaskInFamily(taskId, existing.familyId, {
						...fieldPatch,
						...scoped
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
		const deleted = await deleteTask(taskId, locals.user.id);
		if (!deleted) {
			return json({ error: 'Task not found' }, { status: 404 });
		}
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
