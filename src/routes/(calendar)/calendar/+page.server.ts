// Intl.DateTimeFormat().resolvedOptions().timeZone
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import type { PageServerLoad, Actions } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	calendars,
	events,
	families,
	familyMembers,
	users,
	type CalendarEvent
} from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createUserCalendar } from '$lib/server/db/actions/calendar';
import { getAdEventsForUser, checkUserAdConsent } from '$lib/server/services/adService';
import { createEvent, updateRsvp, getUserRsvp } from '$lib/server/db/actions/events';

const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds

const parseEvents = function (eventsData) {
	return eventsData.flatMap((e) => {
		// Ensure start and end are Date objects
		const startDate = new Date(e.start);
		const endDate = new Date(e.end);
		
		if (startDate.getDate() === endDate.getDate()) {
			// Single day event
			return {
				...e,
				start: startDate,
				end: endDate,
				date: startDate
			};
		}
		
		// Multi-day event - create one entry per day
		const diffDays = Math.round(Math.abs((startDate.getTime() - endDate.getTime()) / oneDay));
		const days = [];
		
		for (let i = 0; i <= diffDays; i++) {
			days.push({
				...e,
				start: startDate,
				end: endDate,
				date: new Date(startDate.getTime() + oneDay * i)
			});
		}
		
		return days;
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
	
	// Get family members for contacts
	let familyMembersList: { id: string; name: string; email: string; userId: string }[] = [];
	let calendarIds: { id: string; name: string }[] = [];
	
	// Add user's personal calendar(s)
	if (userCalendar.length > 0) {
		calendarIds.push({ id: userCalendar[0].id, name: 'Personal Calendar' });
	}
	
	try {
		// Only query if familyId is a valid string
		if (familyId && typeof familyId === 'string') {
			const [family] = await db.select().from(families).where(eq(families.id, familyId));
			familyCalendarColor = family?.color || '#e0ffff';
			
			let familyCals = await db.select().from(calendars).where(eq(calendars.familyId, familyId));
			if (familyCals.length > 0) {
				familyEventsData = await db
					.select()
					.from(events)
					.where(eq(events.calendarId, familyCals[0].id))
					.orderBy(events.start);
				// Add family calendar to calendarIds
				calendarIds.push({ id: familyCals[0].id, name: family?.name || 'Family Calendar' });
			}
			
			// Get all family members with user details
			const members = await db
				.select({
					id: familyMembers.userId,
					name: users.firstName,
					email: users.email,
					userId: familyMembers.userId
				})
				.from(familyMembers)
				.innerJoin(users, eq(familyMembers.userId, users.id))
				.where(eq(familyMembers.familyId, familyId));
				
			familyMembersList = members || [];
		}
	} catch (e) {
		console.error('Error fetching family members:', e);
		familyMembersList = [];
	}

	const hasAdConsent = await checkUserAdConsent(userId);
	const showAds = hasAdConsent && (userSettings?.showAdsAsEvents ?? false);
	let adEventsData: CalendarEvent[] = [];
	
	if (showAds) {
		const now = new Date();
		adEventsData = await getAdEventsForUser(userId, now.getMonth() + 1, now.getFullYear());
	}

	return {
		userEvents: parseEvents(userEvents),
		familyEvents: parseEvents(familyEventsData),
		adEvents: parseEvents(adEventsData),
		userSettings,
		userCalendarColor: userSettings?.color || '#fa8072',
		familyCalendarColor,
		showAds,
		familyMembers: familyMembersList,
		calendarIds
	};
};

export const actions: Actions = {
	createEvent: async (event) => {
		const userId = event.locals.user!.id;
		const data = await event.request.formData();

		const title = data.get('title') as string;
		const start = data.get('start') as string;
		const end = data.get('end') as string || null;
		const description = data.get('description') as string || null;
		const location = data.get('location') as string || null;
		let calendarId = data.get('calendarId') as string || null;
		const allDay = data.get('allDay') === 'true';

		// Auto-get or create user calendar if not provided
		if (!calendarId || calendarId === '') {
			let userCalendar = await db.select().from(calendars).where(eq(calendars.ownerId, userId));
			if (userCalendar.length === 0) {
				const [newCal] = await db.insert(calendars).values({ ownerId: userId }).returning();
				calendarId = newCal.id;
			} else {
				calendarId = userCalendar[0].id;
			}
		}

		// Default end to start + 1 hour if not provided
		const startDate = new Date(start);
		const endDate = end ? new Date(end) : new Date(startDate.getTime() + 60 * 60 * 1000);

		const eventData = {
			calendarId,
			ownerId: userId,
			title,
			start: startDate.toISOString(),
			end: endDate.toISOString(),
			description,
			location,
			allDay
		};

		const created = await createEvent(eventData, userId);
		return { success: true, event: created };
	},
	
	updateRsvp: async (event) => {
		const userId = event.locals.user!.id;
		const data = await event.request.formData();
		
		const eventId = data.get('eventId') as string;
		const status = data.get('status') as 'going' | 'maybe' | 'declined' | 'undecided';
		
		await updateRsvp(eventId, userId, status);
		return { success: true, status };
	}
};
