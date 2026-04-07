import { updateEvent, deleteEvent, getEvent } from '$lib/server/db/actions/events';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { DateTime } from 'luxon';
import type { PageServerLoad } from './$types';
import { calendars } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { getUserFamilies } from '$lib/server/db/actions/families';
import { getUserCalendar } from '$lib/server/db/actions/calendar';

export const load: PageServerLoad = async (event) => {
	let calendarIds: { id: string; name: string }[] = [];
	let userId = event.locals.user.id;
	const userFamily = await getUserFamilies(userId);

	let familyCalendar = [];
	if (!!userFamily) {
		familyCalendar = await db
			.select()
			.from(calendars)
			.where(eq(calendars.familyId, userFamily.familyMembers.familyId));
		if (familyCalendar.length > 0) {
			calendarIds.push({ id: familyCalendar[0].id, name: familyCalendar[0].name || 'Family Calendar' });
		}
	}
	let userCalendar = await getUserCalendar(userId);
	calendarIds.push({ id: userCalendar.id, name: userCalendar.name || 'User Calendar' });

	const eventData = await getEvent(event.params.id);

	return {
		calendarIds,
		event: eventData
	};
};

export const actions: Actions = {
	default: async ({ request }) => {
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

		let start2 = DateTime.fromISO(start.replace(' ', 'T'));
		let end2 = DateTime.fromISO(end.replace(' ', 'T'));

		const updatedEvent = await updateEvent(eventId, {
			description: description,
			title: title.toString(),
			start: start2.toString(),
			end: end2.toString(),
			location: location.toString(),
			calendarId: calendarId.toString(),
			ownerId
		});

		if (updatedEvent) {
			throw redirect(302, '/calendar');
		} else {
			return fail(500, { message: 'Failed to update event' });
		}
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
