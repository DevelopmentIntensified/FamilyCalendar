import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { events, calendars } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { Actions } from './$types';
import { deleteEvent, getEventAttendance } from '$lib/server/db/actions/events';
import { error, fail, redirect } from '@sveltejs/kit';
import { getUserSettings } from '$lib/server/db/actions/userSettings';

export const load: PageServerLoad = async (e) => {
	if (!e.locals.user) {
		return redirect(302, '/login');
	}
	const userSettings = await getUserSettings(e.locals.user.id);
	
	const eventData = await db
		.select({
			event: events,
			calendar: calendars
		})
		.from(events)
		.leftJoin(calendars, eq(events.calendarId, calendars.id))
		.where(eq(events.id, e.params.id))
		.limit(1);

	if (!eventData.length) {
		error(404, 'Event not found');
	}

	// Joined with users so the UI can show names instead of raw ids.
	const attendanceData = await getEventAttendance(e.params.id);

	const userAttendance = attendanceData.find((a) => a.userId === e.locals.user.id);

	return {
		event: {
			...eventData[0].event,
			start: new Date(eventData[0].event.start),
			end: new Date(eventData[0].event.end ?? eventData[0].event.start),
			date: new Date(eventData[0].event.start)
		},
		calendar: eventData[0].calendar,
		attendees: attendanceData,
		userAttendance: userAttendance?.status || 'undecided',
		userSettings,
		isFamilyEvent: !!eventData[0].calendar?.familyId
	};
};

export const actions: Actions = {
	deleteEvent: async ({ request, locals }) => {
		const formData = await request.formData();
		const eventId = formData.get('eventId') as string;

		if (!eventId) {
			return fail(400, { message: 'Event ID is required' });
		}

		// Check ownership
		const eventData = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
		if (!eventData.length || eventData[0].ownerId !== locals.user.id) {
			return fail(403, { message: 'Not authorized to delete this event' });
		}

		await deleteEvent(eventId);
		throw redirect(302, '/calendar');
	}
};
