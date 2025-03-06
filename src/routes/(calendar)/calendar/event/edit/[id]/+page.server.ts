import { createEvent, updateEvent } from '$lib/server/db/actions/events';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { DateTime } from 'luxon';
import type { PageServerLoad } from './$types';
import { calendars, families, familyMembers } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { getUserFamily } from '$lib/server/db/actions/families';
import { getUserCalendar } from '$lib/server/db/actions/calendar';

// get the possible calendar ids for the current user
export const load: PageServerLoad = async (event) => {
	let calendarIds: { id: string, name: string }[] = []
	let userId = event.locals.user.id
	const userFamily = await getUserFamily(userId)

	let familyCalendar = []
	if (!!userFamily) {
		//get the family calendar if the user is part of a family to add it to the list of ids
		familyCalendar = await db
			.select()
			.from(calendars)
			.where(eq(calendars.familyId, userFamily.familyMembers.familyId))
		calendarIds.push({ id: familyCalendar[0].id, name: "Family Calendar" })
	}
	let userCalendar = await getUserCalendar(userId) // get the user calendar so we can get its id
	calendarIds.push({ id: userCalendar.id, name: "User Calendar" })

	return {
		calendarIds,
    eventId: event.params.id
	}
};


export const actions: Actions = {
	editEvent: async ({ request }) => {
		const formData = await request.formData();
		const title = formData.get('title');
		const start = formData.get('start');
		const end = formData.get('end');
		const location = formData.get('location');
		const calendarId = formData.get('calendarId');
		const description = formData.get('description') as string;
		const ownerId = formData.get('ownerId') as string;
		const eventId = formData.get('eventId') as string;

		if (!title || !start || !end || !location || !calendarId || !eventId) {
			return fail(400, { message: 'All fields are required' });
		}
		const offset = formData.get("offset") as string

		let start2 = DateTime.fromISO(start.replace(" ", "T"))
		let end2 = DateTime.fromISO(end.replace(" ", "T"))

		const newEvent = await updateEvent(eventId, {
			description: description,
			title: title.toString(),
			start: start2.toString(),
			end: end2.toString(),
			location: location.toString(),
			calendarId: calendarId.toString(),
			ownerId,
		});

		if (newEvent) {
			throw redirect(302, '/calendar');
		} else {
			return fail(500, { message: 'Failed to create event' });
		}
	}
};

