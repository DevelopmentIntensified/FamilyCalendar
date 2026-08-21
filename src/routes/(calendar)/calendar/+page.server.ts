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
import { expandRecurrence } from '$lib/server/services/recurrenceService';
import { getExceptionsByEventIds } from '$lib/server/db/actions/events';

const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds

function deriveEventProps(e: Record<string, any>, date: Date, end: Date | null) {
	return {
		...e,
		start: date,
		end: end || e.end,
		date
	};
}

/**
 * Expands recurring event masters into virtual occurrences with composite
 * ids (`{masterId}~{occurrenceISO}`), then applies Exception Overrides:
 * cancelled occurrences are dropped, edited ones are merged in place.
 */
function expandRecurringEvents(
	eventsData: CalendarEvent[],
	exceptions: Awaited<ReturnType<typeof getExceptionsByEventIds>>
) {
	const exceptionByKey = new Map(
		exceptions.map((x) => [`${x.eventId}~${new Date(x.originalDate).toISOString()}`, x])
	);

	const windowStart = new Date(Date.now() - 2 * 365 * oneDay);
	const windowEnd = new Date(Date.now() + 2 * 365 * oneDay);

	const result: Record<string, any>[] = [];
	for (const e of eventsData) {
		const occurrences = expandRecurrence(e, windowStart, windowEnd);
		if (occurrences.length === 0) continue;

		const durationMs = e.end ? new Date(e.end).getTime() - new Date(e.start).getTime() : null;

		for (const occ of occurrences) {
			const occIso = occ.toISOString();
			const key = `${e.id}~${occIso}`;
			const exception = exceptionByKey.get(key);
			if (exception?.isCancelled) continue;

			const occEnd = durationMs !== null ? new Date(occ.getTime() + durationMs) : null;
			result.push({
				...e,
				id: key,
				masterId: e.id,
				occurrenceDate: occIso,
				start: occ.toISOString(),
				end: occEnd ? occEnd.toISOString() : null,
				title: exception?.title ?? e.title,
				description: exception?.description ?? e.description,
				location: exception?.location ?? e.location,
				allDay: exception?.allDay ?? e.allDay
			});
		}
	}
	return result;
}

const parseEvents = function (eventsData) {
	return eventsData.flatMap((e) => {
		const startDate = new Date(e.start);
		const endDate = e.end ? new Date(e.end) : null;
		
		if (!endDate || startDate.getDate() === endDate.getDate()) {
			return deriveEventProps(e, startDate, endDate);
		}
		
		const diffDays = Math.round(Math.abs((startDate.getTime() - endDate.getTime()) / oneDay));
		const days = [];
		
		for (let i = 0; i <= diffDays; i++) {
			days.push(deriveEventProps(e, new Date(startDate.getTime() + oneDay * i), endDate));
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
	const userCalendarColor = userSettings?.color || '#fa8072';
	let calendarIds: { id: string; name: string; color: string }[] = [];
	
	if (userCalendar.length > 0) {
		calendarIds.push({ id: userCalendar[0].id, name: 'Personal Calendar', color: userCalendarColor });
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
				calendarIds.push({ id: familyCals[0].id, name: family?.name || 'Family Calendar', color: familyCalendarColor });
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

	const allUserEventIds = [...userEvents, ...familyEventsData].map((e) => e.id);
	const exceptions = await getExceptionsByEventIds(allUserEventIds);

	return {
		userEvents: parseEvents(expandRecurringEvents(userEvents, exceptions)).map(e => ({ ...e, color: userCalendarColor })),
		familyEvents: parseEvents(expandRecurringEvents(familyEventsData, exceptions)).map(e => ({ ...e, color: familyCalendarColor })),
		adEvents: parseEvents(adEventsData).map(e => ({ ...e, color: '#f59e0b' })),
		userSettings,
		userCalendarColor,
		familyCalendarColor,
		showAds,
		familyMembers: familyMembersList,
		calendarIds
	};
};
