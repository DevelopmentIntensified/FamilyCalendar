import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateRsvp, getEventAttendance, getEventRsvpStatus } from '$lib/server/db/actions/events';
import { db } from '$lib/server/db';
import { events } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getAccessibleCalendarIds } from '$lib/server/utils/calendarScope';

// Caller may touch an event only if they own it or it lives on a
// calendar they can see (personal or their family's).
async function requireEventAccess(userId: string, eventId: string) {
	const [event] = await db
		.select({ id: events.id, calendarId: events.calendarId, ownerId: events.ownerId })
		.from(events)
		.where(eq(events.id, eventId))
		.limit(1);

	if (!event) {
		return { error: json({ error: 'Event not found' }, { status: 404 }) };
	}

	const calIds = await getAccessibleCalendarIds(userId);
	const hasCalendarAccess = !!event.calendarId && calIds.includes(event.calendarId);
	if (event.ownerId !== userId && !hasCalendarAccess) {
		return { error: json({ error: 'No access to this event' }, { status: 403 }) };
	}

	return { error: null };
}

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = locals.user.id;
	const gate = await requireEventAccess(userId, params.id);
	if (gate.error) return gate.error;

	const body = await request.json();
	const { status } = body;

	if (!['going', 'maybe', 'declined', 'undecided'].includes(status)) {
		return json({ error: 'Invalid RSVP status' }, { status: 400 });
	}

	try {
		await updateRsvp(params.id, userId, status);
		const rsvpStatus = await getEventRsvpStatus(params.id);
		const attendance = await getEventAttendance(params.id);
		return json({ success: true, rsvpStatus, attendance });
	} catch (error) {
		console.error('Failed to update RSVP:', error);
		return json({ error: 'Failed to update RSVP' }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const gate = await requireEventAccess(locals.user.id, params.id);
	if (gate.error) return gate.error;

	try {
		const attendance = await getEventAttendance(params.id);
		const userRsvp = attendance.find(a => a.userId === locals.user.id);
		return json({
			attendance,
			userRsvpStatus: userRsvp?.status || 'undecided',
			nonUserAttendants: attendance.filter(a => !a.userId && a.name).map(a => a.name)
		});
	} catch (error) {
		console.error('Failed to fetch attendance:', error);
		return json({ error: 'Failed to fetch attendance' }, { status: 500 });
	}
};
