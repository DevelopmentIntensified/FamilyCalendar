// Intl.DateTimeFormat().resolvedOptions().timeZone
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	calendars,
	events,
	families,
	type CalendarEvent
} from '$lib/server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { createUserCalendar } from '$lib/server/db/actions/calendar';
import { getFamilyRoster, getUserFamilyId } from '$lib/server/db/actions/families';
import { getAdEventsForUser, checkUserAdConsent } from '$lib/server/services/adService';
import { parseEvents, expandEventsForUser } from '$lib/server/services/eventDisplayService';
import { getTasksForUser, syncRecurringCursors } from '$lib/server/db/actions/tasks';
import { getUserZone, zonedNow } from '$lib/server/utils/userTimezone';
import { GUEST_MERGE_COOKIE } from '$lib/server/services/guestMergeService';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	let userId = event.locals.user.id;

	// Pending guest-merge from a recent login? Prompt before anything else.
	const stashCookie = event.cookies.get(GUEST_MERGE_COOKIE);
	if (stashCookie && event.locals.user.email !== null && stashCookie !== userId) {
		const { isClaimableGuest } = await import('$lib/server/services/guestMergeService');
		if (await isClaimableGuest(stashCookie)) {
			return redirect(302, '/merge-guest');
		}
		event.cookies.delete(GUEST_MERGE_COOKIE, { path: '/' });
	}

	let userSettings = await getUserSettings(userId);
	let userCalendar = await db
		.select()
		.from(calendars)
		.where(and(eq(calendars.ownerId, userId), isNull(calendars.familyId)));

	if (userCalendar.length === 0) {
		await createUserCalendar(userId);
		userCalendar = await db
			.select()
			.from(calendars)
			.where(and(eq(calendars.ownerId, userId), isNull(calendars.familyId)));
	}

	let userEvents: CalendarEvent[] = [];
	if (userCalendar.length > 0) {
		userEvents = await db
			.select()
			.from(events)
			.where(eq(events.calendarId, userCalendar[0].id))
			.orderBy(events.start);
	}

	const familyId = await getUserFamilyId(userId);

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
			
			const members = await getFamilyRoster(familyId);

			// Anonymous members have no email yet — render as blank.
			familyMembersList = members.map((m) => ({
				id: m.userId,
				name: m.firstName,
				email: m.email ?? '',
				userId: m.userId
			}));
		}
	} catch (e) {
		console.error('Error fetching family members:', e);
		familyMembersList = [];
	}

	const hasAdConsent = await checkUserAdConsent(userId);
	const showAds = hasAdConsent && (userSettings?.showAdsAsEvents ?? false);
	let adEventsData: CalendarEvent[] = [];

	if (showAds) {
		const now = zonedNow(await getUserZone(userId));
		adEventsData = await getAdEventsForUser(userId, now.month, now.year);
	}

	// Open tasks with due dates render as distinct chips on month-view days.
	// Overdue Recurring Tasks first stick to today (cursor v3).
	await syncRecurringCursors(userId, familyId, await getUserZone(userId));
	const allTasks = await getTasksForUser(userId, familyId);
	const dueTasks = allTasks
		.filter((t) => t.dueDate && !t.completedAt)
		.map((t) => ({
			id: t.id,
			title: t.title,
			dueDate: new Date(t.dueDate as unknown as string),
			recurrenceFrequency: t.recurrenceFrequency,
			recurrenceInterval: t.recurrenceInterval
		}));

	return {
		userEvents: parseEvents(await expandEventsForUser(userEvents)).map(e => ({ ...e, color: userCalendarColor })),
		familyEvents: parseEvents(await expandEventsForUser(familyEventsData)).map(e => ({ ...e, color: familyCalendarColor })),
		adEvents: parseEvents(adEventsData).map(e => ({ ...e, color: '#f59e0b' })),
		dueTasks,
		userSettings,
		userCalendarColor,
		familyCalendarColor,
		showAds,
		familyMembers: familyMembersList,
		calendarIds
	};
};
