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
import { parseEvents, expandEventsForUser } from '$lib/server/services/eventDisplayService';
import { getTasksForUser } from '$lib/server/db/actions/tasks';
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

			// Anonymous members have no email yet — render as blank.
			familyMembersList = (members || []).map((m) => ({ ...m, email: m.email ?? '' }));
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

	// Open tasks with due dates render as distinct chips on month-view days.
	const allTasks = await getTasksForUser(userId, member?.familyId ?? null);
	const dueTasks = allTasks
		.filter((t) => t.dueDate && !t.completedAt)
		.map((t) => ({
			id: t.id,
			title: t.title,
			dueDate: new Date(t.dueDate as unknown as string)
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
