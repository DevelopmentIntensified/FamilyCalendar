import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { events, eventAttendance, calendars, families } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import type { Actions } from './$types';
import { deleteEvent } from '$lib/server/db/actions/events';
import { fail, redirect } from '@sveltejs/kit';
import { getUserSettings } from '$lib/server/db/actions/userSettings';

export const load: PageServerLoad = async (e) => {
	if (!e.locals.user) {
		return redirect(302, '/login');
	}
	const userSettings = await getUserSettings(e.locals.user.id);
	
	const eventsData = await db
		.select({
			event: events,
			calendar: calendars
		})
		.from(events)
		.leftJoin(calendars, eq(events.calendarId, calendars.id))
		.where(eq(events.id, e.params.id))
		.orderBy(events.start);

	const event = eventsData[0];
	const isFamilyEvent = !!event?.calendar?.familyId;

	const attendanceData = await db
		.select()
		.from(eventAttendance)
		.where(eq(eventAttendance.eventId, e.params.id));

	const userAttendance = attendanceData.find(a => a.userId === e.locals.user.id);

	return {
		event: eventsData.map(({ event: ev }) => ({
			date: new Date(ev.start),
			...ev,
			start: new Date(ev.start),
			end: new Date(ev.end)
		}))[0],
		userAttendance: userAttendance?.status || 'undecided',
		userSettings,
		isFamilyEvent
	};
};

export const actions: Actions = {
	rsvp: async ({ request, locals }) => {
		const formData = await request.formData();
		const status = formData.get('status') as string;
		const eventId = formData.get('eventId') as string;
		const userId = locals.user.id;

		if (!status || !eventId) {
			return fail(400, { message: 'Missing required fields' });
		}

		const existing = await db
			.select()
			.from(eventAttendance)
			.where(and(eq(eventAttendance.eventId, eventId), eq(eventAttendance.userId, userId)));

		if (existing.length > 0) {
			await db
				.update(eventAttendance)
				.set({ status })
				.where(and(eq(eventAttendance.eventId, eventId), eq(eventAttendance.userId, userId)));
		} else {
			await db.insert(eventAttendance).values({
				eventId,
				userId,
				status
			});
		}

		return { success: true };
	},
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
