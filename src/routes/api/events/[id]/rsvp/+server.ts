import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateRsvp, getEventAttendance, getEventRsvpStatus } from '$lib/server/db/actions/events';
import { canTouchEvent } from '$lib/server/db/actions/calendarScope';

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = locals.user.id;
	const access = await canTouchEvent(userId, params.id);
	if (access === 'not-found') return json({ error: 'Event not found' }, { status: 404 });
	if (access === 'forbidden') return json({ error: 'No access to this event' }, { status: 403 });

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

	const access = await canTouchEvent(locals.user.id, params.id);
	if (access === 'not-found') return json({ error: 'Event not found' }, { status: 404 });
	if (access === 'forbidden') return json({ error: 'No access to this event' }, { status: 403 });

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
