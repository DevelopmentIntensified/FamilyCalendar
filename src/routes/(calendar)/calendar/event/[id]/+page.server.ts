import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { events, eventAttendance } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { Actions } from './$types';
import { deleteEvent } from '$lib/server/db/actions/events';
import { fail, redirect } from '@sveltejs/kit';
import { getUserSettings } from '$lib/server/db/actions/userSettings';

export const load: PageServerLoad = async (e) => {
	const userSettings = await getUserSettings(e.locals.user.id);
	
	const eventsData = await db
		.select()
		.from(events)
		.where(eq(events.id, e.params.id))
		.orderBy(events.start);

	const attendanceData = await db
		.select()
		.from(eventAttendance)
		.where(eq(eventAttendance.eventId, e.params.id));

	const userAttendance = attendanceData.find(a => a.userId === e.locals.user.id);

	return {
		event: eventsData.map((ev) => ({
			date: new Date(ev.start),
			...ev,
			start: new Date(ev.start),
			end: new Date(ev.end)
		}))[0],
		userAttendance: userAttendance?.status || 'undecided',
		userSettings
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
			.where(eq(eventAttendance.eventId, eventId))
			.where(eq(eventAttendance.userId, userId));

		if (existing.length > 0) {
			await db
				.update(eventAttendance)
				.set({ status })
				.where(eq(eventAttendance.eventId, eventId))
				.where(eq(eventAttendance.userId, userId));
		} else {
			await db.insert(eventAttendance).values({
				eventId,
				userId,
				status
			});
		}

		return { success: true };
	},
	deleteEvent: async ({ request }) => {
		const formData = await request.formData();
		const eventId = formData.get('eventId') as string;

		if (!eventId) {
			return fail(400, { message: 'Event ID is required' });
		}

		await deleteEvent(eventId);
		throw redirect(302, '/calendar');
	}
};
