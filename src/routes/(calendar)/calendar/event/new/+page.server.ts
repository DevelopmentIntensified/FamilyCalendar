import { createEvent } from '$lib/server/db/actions/events';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { DateTime } from 'luxon';
import type { PageServerLoad } from './$types';
import { calendars, families, familyMembers } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { getUserFamilies } from '$lib/server/db/actions/families';
import { getUserCalendar } from '$lib/server/db/actions/calendar';
import { getUserSettings } from '$lib/server/db/actions/userSettings';

// get the possible calendar ids for the current user
export const load: PageServerLoad = async (event) => {
	let calendarIds: { id: string; name: string }[] = [];
	let userId = event.locals.user.id;
	const userFamily = await getUserFamilies(userId);

	let familyCalendar = [];
	if (!!userFamily) {
		//get the family calendar if the user is part of a family to add it to the list of ids
		familyCalendar = await db
			.select()
			.from(calendars)
			.where(eq(calendars.familyId, userFamily.familyMembers.familyId));
		if (familyCalendar.length > 0) {
			calendarIds.push({ id: familyCalendar[0].id, name: familyCalendar[0].name || 'Family Calendar' });
		}
	}
	let userCalendar = await getUserCalendar(userId); // get the user calendar so we can get its id
	calendarIds.push({ id: userCalendar.id, name: userCalendar.name || 'User Calendar' });

	return {
		calendarIds
	};
};

export const actions: Actions = {
	createEvent: async ({ request, locals }) => {
		const formData = await request.formData();
		const title = formData.get('title');
		const start = formData.get('start');
		const end = formData.get('end');
		const location = formData.get('location');
		const calendarId = formData.get('calendarId');
		const description = formData.get('description') as string;
		const ownerId = formData.get('ownerId') as string;

		//require certain fields
		if (!title || !start || !end || !location || !calendarId) {
			return fail(400, { message: 'All fields are required' });
		}

		const userSettings = await getUserSettings(locals.user.id);
		const userTimeZone = userSettings?.timeZone || 'UTC';

		const startDateTime = DateTime.fromISO(start.replace(' ', 'T'), { zone: userTimeZone });
		const endDateTime = DateTime.fromISO(end.replace(' ', 'T'), { zone: userTimeZone });

		if (!startDateTime.isValid || !endDateTime.isValid) {
			return fail(400, { message: 'Invalid date/time format' });
		}

		const newEvent = await createEvent({
			description: description,
			title: title.toString(),
			start: startDateTime.toString(),
			end: endDateTime.toString(),
			location: location.toString(),
			calendarId: calendarId.toString(),
			ownerId
		});

		if (newEvent) {
			throw redirect(302, '/calendar');
		} else {
			return fail(500, { message: 'Failed to create event' });
		}
	}
};
