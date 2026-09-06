import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import type { RequestHandler } from './$types';
import {
	createTask,
	getTasksForUser,
	getTasksForEvent,
	isFamilyMember,
	isValidAssignee,
	normalizeTags,
	TASK_FREQUENCIES,
	TASK_VISIBILITIES
} from '$lib/server/db/actions/tasks';
import { normalizeTaskPriority } from '$lib/server/db/actions/taskPriority';
import { db } from '$lib/server/db';
import { events, users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createNotification } from '$lib/server/db/actions/notifications';
import { getAccessibleCalendarIds } from '$lib/server/db/actions/calendarScope';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { requireUserJson } from '$lib/server/utils/requireUser';

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;

	const eventId = url.searchParams.get('eventId');
	if (eventId) {
		const [event] = await db
			.select({ id: events.id, calendarId: events.calendarId, ownerId: events.ownerId })
			.from(events)
			.where(eq(events.id, eventId))
			.limit(1);
		if (!event) {
			return json({ tasks: [] });
		}
		const calIds = await getAccessibleCalendarIds(auth.user.id);
		const hasCalendarAccess = !!event.calendarId && calIds.includes(event.calendarId);
		if (event.ownerId !== auth.user.id && !hasCalendarAccess) {
			return json({ error: 'No access to this event' }, { status: 403 });
		}
		const eventTasks = await getTasksForEvent(eventId);
		return json({ tasks: eventTasks });
	}

	const userTasks = await getTasksForUser(auth.user.id, await getUserFamilyId(auth.user.id));
	return json({ tasks: userTasks });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;

	const body = await request.json();
	if (!isNonEmptyString(body.title)) {
		return json({ error: 'Title is required' }, { status: 400 });
	}

	try {
		let familyId: string | null = null;
		if (body.familyId === undefined) {
			familyId = await getUserFamilyId(auth.user.id);
		} else if (body.familyId !== null) {
			if (!(await isFamilyMember(auth.user.id, body.familyId))) {
				return json({ error: 'Not a member of this family' }, { status: 403 });
			}
			familyId = body.familyId;
		}

		const frequency = TASK_FREQUENCIES.includes(body.recurrenceFrequency)
			? body.recurrenceFrequency
			: null;

		const priority = normalizeTaskPriority(body.priority);

		// Task scoping (issue 019): visibility is 'public' by default; an
		// explicit value must be one of the supported ones or the request
		// is rejected rather than silently re-scoped.
		let visibility = 'public';
		if (body.visibility !== undefined) {
			if (!TASK_VISIBILITIES.includes(body.visibility)) {
				return json({ error: 'Invalid visibility' }, { status: 400 });
			}
			visibility = body.visibility;
		}

		// Assignment: a Task defaults to its creator unless another
		// person is specified. Self-assign is instant-accept; assigning
		// someone else starts a pending request they accept or decline.
		// The target must be reachable — the creator themself or a member
		// of the target family — or the task strands as a pending row its
		// assignee can never see.
		const assignedTo = isNonEmptyString(body.assignedTo) ? body.assignedTo : auth.user.id;
		if (!(await isValidAssignee(auth.user.id, familyId, assignedTo))) {
			return json({ error: 'Assignee is not a member of this family' }, { status: 400 });
		}
		const assignmentStatus = assignedTo === auth.user.id ? 'accepted' : 'pending';

		const created = await createTask({
			title: body.title.trim(),
			notes: body.notes || null,
			dueDate: body.dueDate || null,
			recurrenceFrequency: frequency,
			recurrenceInterval: frequency ? Math.max(1, Math.floor(body.recurrenceInterval ?? 1)) : null,
			assignedTo,
			assignmentStatus,
			priority,
			visibility,
			tags: normalizeTags(body.tags),
			eventId: body.eventId || null,
			familyId,
			userId: auth.user.id
		});

		// Assignment fan-out: tell the assignee there's a pending task.
		// createNotification swallows its own failures, so a notification
		// problem can never fail the task create.
		if (created.assignmentStatus === 'pending' && created.assignedTo) {
			const [creator] = await db
				.select({ firstName: users.firstName })
				.from(users)
				.where(eq(users.id, auth.user.id))
				.limit(1);
			const actorName = creator?.firstName || 'Someone';
			await createNotification({
				userId: created.assignedTo,
				type: 'assignment_pending',
				actorName,
				message: `${actorName} assigned you '${created.title}'`,
				link: '/calendar/tasks'
			});
		}

		return json({ success: true, task: created }, { status: 201 });
	} catch (error) {
		console.error('Failed to create task:', error);
		return apiError(
			new URL(request.url).pathname,
			500,
			'Failed to create task',
			locals.user?.id ?? null
		);
	}
};
