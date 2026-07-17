import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createEvent, updateEventById, deleteEventById } from '$lib/server/db/actions/events';
import { db } from '$lib/server/db';
import { calendars, events } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = locals.user.id;
	const body = await request.json();

	const attendantNames: string[] = Array.isArray(body.attendants) ? body.attendants : [];

	let calendarId = body.calendarId;
	if (!calendarId) {
		let userCalendar = await db.select().from(calendars).where(eq(calendars.ownerId, userId));
		if (userCalendar.length === 0) {
			const [newCal] = await db.insert(calendars).values({ ownerId: userId }).returning();
			calendarId = newCal.id;
		} else {
			calendarId = userCalendar[0].id;
		}
	}

	const eventData = {
		calendarId,
		ownerId: userId,
		title: body.title,
		start: body.start,
		end: body.end || null,
		description: body.description || null,
		location: body.location || null,
		allDay: body.allDay || false
	};

	try {
		const created = await createEvent(eventData, userId, attendantNames);
		return json({ success: true, event: created }, { status: 201 });
	} catch (error) {
		console.error('Failed to create event:', error);
		return json({ error: 'Failed to create event' }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ request, locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = locals.user.id;
	const eventId = url.pathname.split('/').pop();

	if (!eventId) {
		return json({ error: 'Event ID required' }, { status: 400 });
	}

	const body = await request.json();
	const attendantNames: string[] = Array.isArray(body.attendants) ? body.attendants : [];

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
		const updated = await updateEventById(eventId, eventData, userId, attendantNames);
		if (!updated) {
			return json({ error: 'Event not found' }, { status: 404 });
		}
		return json({ success: true, event: updated });
	} catch (error) {
		console.error('Failed to update event:', error);
		return json({ error: 'Failed to update event' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = locals.user.id;
	const eventId = url.pathname.split('/').pop();

	if (!eventId) {
		return json({ error: 'Event ID required' }, { status: 400 });
	}

	try {
		await deleteEventById(eventId, userId);
		return json({ success: true }, { status: 200 });
	} catch (error) {
		console.error('Failed to delete event:', error);
		return json({ error: 'Failed to delete event' }, { status: 500 });
	}
};
