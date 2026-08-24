import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createTask,
	getTasksForUser,
	getTasksForEvent,
	TASK_FREQUENCIES
} from '$lib/server/db/actions/tasks';
import { db } from '$lib/server/db';
import { events, familyMembers } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { getAccessibleCalendarIds } from '$lib/server/utils/calendarScope';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

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
		const calIds = await getAccessibleCalendarIds(locals.user.id);
		const hasCalendarAccess = !!event.calendarId && calIds.includes(event.calendarId);
		if (event.ownerId !== locals.user.id && !hasCalendarAccess) {
			return json({ error: 'No access to this event' }, { status: 403 });
		}
		const eventTasks = await getTasksForEvent(eventId);
		return json({ tasks: eventTasks });
	}

	const [member] = await db
		.select()
		.from(familyMembers)
		.where(eq(familyMembers.userId, locals.user.id));

	const userTasks = await getTasksForUser(locals.user.id, member?.familyId ?? null);
	return json({ tasks: userTasks });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
		return json({ error: 'Title is required' }, { status: 400 });
	}

	try {
		let familyId: string | null = null;
		if (body.familyId === undefined) {
			const [member] = await db
				.select()
				.from(familyMembers)
				.where(eq(familyMembers.userId, locals.user.id));
			familyId = member?.familyId ?? null;
		} else if (body.familyId !== null) {
			const [member] = await db
				.select()
				.from(familyMembers)
				.where(
					and(eq(familyMembers.userId, locals.user.id), eq(familyMembers.familyId, body.familyId))
				);
			if (!member) {
				return json({ error: 'Not a member of this family' }, { status: 403 });
			}
			familyId = body.familyId;
		}

		const frequency = TASK_FREQUENCIES.includes(body.recurrenceFrequency)
			? body.recurrenceFrequency
			: null;

		// Assignment: a Task defaults to its creator unless another
		// person is specified. Self-assign is instant-accept; assigning
		// someone else starts a pending request they accept or decline.
		const assignedTo =
			typeof body.assignedTo === 'string' && body.assignedTo ? body.assignedTo : locals.user.id;
		const assignmentStatus = assignedTo === locals.user.id ? 'accepted' : 'pending';

		const created = await createTask({
			title: body.title.trim(),
			notes: body.notes || null,
			dueDate: body.dueDate || null,
			recurrenceFrequency: frequency,
			recurrenceInterval: frequency ? Math.max(1, Math.floor(body.recurrenceInterval ?? 1)) : null,
			assignedTo,
			assignmentStatus,
			eventId: body.eventId || null,
			familyId,
			userId: locals.user.id
		});
		return json({ success: true, task: created }, { status: 201 });
	} catch (error) {
		console.error('Failed to create task:', error);
		return json({ error: 'Failed to create task' }, { status: 500 });
	}
};
