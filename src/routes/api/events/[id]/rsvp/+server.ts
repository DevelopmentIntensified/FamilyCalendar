import { json } from '@sveltejs/kit';
import { apiError } from '$lib/server/utils/apiError';
import type { RequestHandler } from './$types';
import {
	updateRsvp,
	getEventAttendance,
	getEventRsvpStatus,
	addEventAttendants
} from '$lib/server/db/actions/events';
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
	const { status, guest } = body;

	/**
	 * Invite a named guest. The prototype's attendance region ends in "+ Invite",
	 * and a guest is an attendance row with no account behind it — so this adds
	 * one, scoped to the same event-access check as an RSVP. A guest already on
	 * the event is not added twice.
	 */
	if (guest !== undefined) {
		// oxlint-disable-next-line anti-slop/no-runtime-typeof -- the request body is the I/O boundary; `guest` is untyped JSON and a non-string invite is not a name.
		const name = typeof guest === 'string' ? guest.trim() : '';
		if (!name) return json({ error: 'Guest name is required' }, { status: 400 });
		try {
			const attendance = await getEventAttendance(params.id);
			const alreadyThere = attendance.some(
				(row) => !row.userId && (row.name ?? '').trim().toLowerCase() === name.toLowerCase()
			);
			if (!alreadyThere) await addEventAttendants(params.id, [name]);
			const refreshed = await getEventAttendance(params.id);
			return json({ success: true, attendance: refreshed });
		} catch (error) {
			console.error('Failed to invite guest:', error);
			return apiError(
				new URL(request.url).pathname,
				500,
				'Failed to invite guest',
				locals.user?.id ?? null
			);
		}
	}

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
		return apiError(
			new URL(request.url).pathname,
			500,
			'Failed to update RSVP',
			locals.user?.id ?? null
		);
	}
};

export const GET: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const access = await canTouchEvent(locals.user.id, params.id);
	if (access === 'not-found') return json({ error: 'Event not found' }, { status: 404 });
	if (access === 'forbidden') return json({ error: 'No access to this event' }, { status: 403 });

	try {
		const attendance = await getEventAttendance(params.id);
		const userRsvp = attendance.find((a) => a.userId === locals.user.id);
		return json({
			attendance,
			userRsvpStatus: userRsvp?.status || 'undecided',
			nonUserAttendants: attendance.filter((a) => !a.userId && a.name).map((a) => a.name)
		});
	} catch (error) {
		console.error('Failed to fetch attendance:', error);
		return apiError(
			new URL(request.url).pathname,
			500,
			'Failed to fetch attendance',
			locals.user?.id ?? null
		);
	}
};
