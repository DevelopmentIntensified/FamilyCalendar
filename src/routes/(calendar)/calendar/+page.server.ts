// Intl.DateTimeFormat().resolvedOptions().timeZone
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	calendars,
	events,
	families,
	familyMembers,
	type CalendarEvent
} from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds

const parseEvents = function (eventsData) {
	return eventsData.flatMap((e) => {
		e.start = new Date(e.start);
		e.end = new Date(e.end);
		if (e.start.getDate() === e.end.getDate()) {
			// Add the date attribute to the event
			return {
				date: e.start,
				...e
			};
		}
		const diffDays = Math.round(Math.abs((e.start.getTime() - e.end.getTime()) / oneDay)); // get how many days appart the start and end tiems are apart
		const days = [];

		for (let i = 0; i <= diffDays; i++) {
			days.push({
				date: new Date(e.start.getTime() + oneDay * i),
				...e
			}); //add events for each day
		}

		return days; // cause it flattens the array we can return an array of days
	});
};

export const load: PageServerLoad = async (event) => {
	console.log('testf');
	let userId = event.locals.user.id;
	let userSettings = await getUserSettings(userId);
	const [userCalendar] = await db.select().from(calendars).where(eq(calendars.ownerId, userId));
	console.warn('DEBUGPRINT[23]: +page.server.ts:37: userCalendar=', userCalendar);

	const [userFamily] = await db
		.select()
		.from(familyMembers)
		.leftJoin(families, eq(families.id, familyMembers.familyId))
		.where(eq(familyMembers.userId, userId));
	console.warn('DEBUGPRINT[24]: +page.server.ts:44: userFamily=', userFamily);

	let familyEventsData: [] | CalendarEvent[] = [];
	let familyCalendar = [];
	if (!!userFamily) {
		familyCalendar = await db
			.select()
			.from(calendars)
			.where(eq(calendars.familyId, userFamily.familyMembers.familyId));
		console.warn('DEBUGPRINT[25]: +page.server.ts:53: familyCalendar=', familyCalendar);
		familyEventsData = await db
			.select()
			.from(events)
			.where(eq(events.calendarId, familyCalendar[0].id))
			.orderBy(events.start); //get the events
		console.warn('DEBUGPRINT[26]: +page.server.ts:58: familyEventsData=', familyEventsData);
	}

	const eventsData = await db
		.select()
		.from(events)
		.where(eq(events.calendarId, userCalendar.id))
		.orderBy(events.start); //get the events
	console.warn('DEBUGPRINT[27]: +page.server.ts:66: eventsData=', eventsData);

	return {
		userEvents: parseEvents(eventsData),
		familyEvents: parseEvents(familyEventsData),
		userSettings
	};
};
