import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createTask, getTasksForUser, getTasksForEvent } from '$lib/server/db/actions/tasks';
import { db } from '$lib/server/db';
import { familyMembers } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const eventId = url.searchParams.get('eventId');
	if (eventId) {
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
		let familyId = body.familyId ?? null;
		if (familyId === undefined) {
			const [member] = await db
				.select()
				.from(familyMembers)
				.where(eq(familyMembers.userId, locals.user.id));
			familyId = member?.familyId ?? null;
		}

		const created = await createTask({
			title: body.title.trim(),
			notes: body.notes || null,
			dueDate: body.dueDate || null,
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
