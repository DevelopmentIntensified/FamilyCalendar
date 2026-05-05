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
	users,
	type CalendarEvent
} from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createUserCalendar } from '$lib/server/db/actions/calendar';
import { getAdEventsForUser, checkUserAdConsent } from '$lib/server/services/adService';

const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds

const parseEvents = function (eventsData) {
	return eventsData.flatMap((e) => {
		const startDate = new Date(e.start);
		const endDate = new Date(e.end);
		
		if (startDate.getDate() === endDate.getDate()) {
			return {
				...e,
				start: startDate,
				end: endDate,
				date: startDate
			};
		}
		
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
	
	let familyMembersList: { id: string; name: string; email: string; userId: string }[] = [];
	let calendarIds: { id: string; name: string }[] = [];
	
	if (userCalendar.length > 0) {
		calendarIds.push({ id: userCalendar[0].id, name: 'Personal Calendar' });
	}
	
	try {
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
				calendarIds.push({ id: familyCals[0].id, name: family?.name || 'Family Calendar' });
			}
			
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
