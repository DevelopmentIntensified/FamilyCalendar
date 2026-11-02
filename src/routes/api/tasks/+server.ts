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
import { DateTime } from 'luxon';
import { createNotification } from '$lib/server/db/actions/notifications';
import { getAccessibleCalendarIds } from '$lib/server/db/actions/calendarScope';
import { getUserFamilyId } from '$lib/server/db/actions/families';
import { requireUserJson } from '$lib/server/utils/requireUser';
import { parseFocusStartedAt } from '$lib/server/utils/focusStartedAt';
import { getUserZone } from '$lib/server/utils/userTimezone';

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Read access to an event: its owner, or anyone who can read its calendar.
 * Shared by the GET ?eventId= filter and the POST attach (#234) — attaching
 * a task joins the event's title/start into the caller's lists.
 */
async function eventAccess(userId: string, eventId: string): Promise<'missing' | 'denied' | 'ok'> {
	const [event] = await db
		.select({ id: events.id, calendarId: events.calendarId, ownerId: events.ownerId })
		.from(events)
		.where(eq(events.id, eventId))
		.limit(1);
	if (!event) return 'missing';
	if (event.ownerId === userId) return 'ok';
	const calIds = await getAccessibleCalendarIds(userId);
	return !!event.calendarId && calIds.includes(event.calendarId) ? 'ok' : 'denied';
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;

	const eventId = url.searchParams.get('eventId');
	if (eventId) {
		const access = await eventAccess(auth.user.id, eventId);
		if (access === 'missing') {
			return json({ tasks: [] });
		}
		if (access === 'denied') {
			return json({ error: 'No access to this event' }, { status: 403 });
		}
		const eventTasks = (await getTasksForEvent(eventId)).filter(
			(t) => t.visibility !== 'private' || t.userId === auth.user.id
		);
		return json({ tasks: eventTasks });
	}

	// The cursor pin writes the shared row: it must use the token owner's
	// zone, like the page loaders do (#214), not the server's UTC day.
	const [familyId, zone] = await Promise.all([
		getUserFamilyId(auth.user.id),
		getUserZone(auth.user.id)
	]);
	const userTasks = await getTasksForUser(auth.user.id, familyId, zone);
	return json({ tasks: userTasks });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const auth = requireUserJson(locals);
	if (auth.response) return auth.response;

	const body = await request.json();
	if (!isNonEmptyString(body.title)) {
		return json({ error: 'Title is required' }, { status: 400 });
	}

	// #234: a garbage dueDate used to reach the INSERT and 500. Strict ISO
	// (date or datetime); omitted / null / '' = undated.
	let dueDate: string | null = null;
	if (body.dueDate !== undefined && body.dueDate !== null && body.dueDate !== '') {
		if (typeof body.dueDate !== 'string' || !DateTime.fromISO(body.dueDate).isValid) {
			return json({ error: 'Invalid dueDate' }, { status: 400 });
		}
		dueDate = body.dueDate;
	}
	// #234: eventId must be text when present (omitted / null / '' = standalone).
	if (
		body.eventId !== undefined &&
		body.eventId !== null &&
		body.eventId !== '' &&
		typeof body.eventId !== 'string'
	) {
		return json({ error: 'Invalid eventId' }, { status: 400 });
	}
	const eventId: string | null = isNonEmptyString(body.eventId) ? body.eventId : null;

	try {
		// The attached event's title/start are joined into the creator's
		// lists, so they must be able to read it; an unknown id is a 400,
		// not an FK-violation 500 (#234).
		if (eventId) {
			const access = await eventAccess(auth.user.id, eventId);
			if (access === 'missing') return json({ error: 'Event not found' }, { status: 400 });
			if (access === 'denied') {
				return json({ error: 'No access to this event' }, { status: 403 });
			}
		}

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

		// TaskFocus (device-channel spec): focusMinutes is the desktop clock's
		// field, accepted at create for the desktop's own pushes. Whole
		// minutes, >= 0; anything else is an invalid request, not a guess.
		let focusMinutes: number | null = null;
		if (body.focusMinutes !== undefined && body.focusMinutes !== null) {
			if (typeof body.focusMinutes !== 'number' || !Number.isInteger(body.focusMinutes) || body.focusMinutes < 0) {
				return json({ error: 'Invalid focusMinutes' }, { status: 400 });
			}
			focusMinutes = body.focusMinutes;
		}
		// 022: when the desktop creates a task that is already running.
		const focusStartedAt = parseFocusStartedAt(body);
		if (!focusStartedAt.ok) {
			return json({ error: 'Invalid focusStartedAt' }, { status: 400 });
		}

		const created = await createTask({
			title: body.title.trim(),
			notes: body.notes || null,
			dueDate,
			recurrenceFrequency: frequency,
			recurrenceInterval: frequency ? Math.max(1, Math.floor(body.recurrenceInterval ?? 1)) : null,
			assignedTo,
			assignmentStatus,
			priority,
			visibility,
			tags: normalizeTags(body.tags),
			eventId,
			familyId,
			userId: auth.user.id,
			focusMinutes,
			focusStartedAt: focusStartedAt.value ?? null
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
