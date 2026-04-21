// Intl.DateTimeFormat().resolvedOptions().timeZone
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	calendars,
	events,
	families,
	familyMembers,
	type CalendarEvent
} from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createUserCalendar } from '$lib/server/db/actions/calendar';

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
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	let userId = event.locals.user.id;
	let userSettings = await getUserSettings(userId);
	let userCalendar = await db.select().from(calendars).where(eq(calendars.ownerId, userId));

	if (userCalendar.length === 0) {
		await createUserCalendar(userId);
		userCalendar = await db.select().from(calendars).where(eq(calendars.ownerId, userId));
	}

	let userEvents: CalendarEvent[] = [];
	if (userCalendar.length > 0) {
		userEvents = await db
			.select()
			.from(events)
			.where(eq(events.calendarId, userCalendar[0].id))
			.orderBy(events.start);
	}

	const [member] = await db
		.select()
		.from(familyMembers)
		.where(eq(familyMembers.userId, userId));

	let familyId = member?.familyId;
	let familyEventsData: CalendarEvent[] = [];
	let familyCalendarColor = '#e0ffff';
	if (familyId) {
		const [family] = await db.select().from(families).where(eq(families.id, familyId));
		familyCalendarColor = family?.color || '#e0ffff';
		
		let familyCals = await db.select().from(calendars).where(eq(calendars.familyId, familyId));
		if (familyCals.length > 0) {
			familyEventsData = await db
				.select()
				.from(events)
				.where(eq(events.calendarId, familyCals[0].id))
				.orderBy(events.start);
		}
	}

	return {
		userEvents: parseEvents(userEvents),
		familyEvents: parseEvents(familyEventsData),
		userSettings,
		userCalendarColor: userSettings?.color || '#fa8072',
		familyCalendarColor
	};
};
