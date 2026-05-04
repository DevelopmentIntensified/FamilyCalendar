import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateEventById, deleteEventById } from '$lib/server/db/actions/events';

export const PUT: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = locals.user.id;
	const body = await request.json();

	const eventData = {
		title: body.title,
		start: body.start,
		end: body.end || null,
		description: body.description || null,
		location: body.location || null,
		allDay: body.allDay || false,
		calendarId: body.calendarId || null
	};

	try {
		const updated = await updateEventById(params.id, eventData, userId);
		if (!updated) {
			return json({ error: 'Event not found' }, { status: 404 });
		}
		return json({ success: true, event: updated });
	} catch (error) {
		console.error('Failed to update event:', error);
		return json({ error: 'Failed to update event' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		await deleteEventById(params.id, locals.user.id);
		return json({ success: true }, { status: 200 });
	} catch (error) {
		console.error('Failed to delete event:', error);
		return json({ error: 'Failed to delete event' }, { status: 500 });
	}
};
