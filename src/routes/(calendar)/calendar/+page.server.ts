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
import {
	expandEventsForUser,
	parseEvents,
	attachRsvpStatus,
	attachAttendanceSummaries
} from '$lib/server/services/eventDisplayService';
import { getTasksForUser, syncRecurringCursors } from '$lib/server/db/actions/tasks';
import { getUserZone, zonedNow } from '$lib/server/utils/userTimezone';
import { getTodayVerse } from '$lib/server/services/verseService';
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

	// Opt-in landing: with Default View set to "Dashboard", /calendar sends the
	// user to the Day Dashboard. ?dashboardView=1 is the escape hatch the
	// dashboard's "Back to Calendar" link uses to show the calendar itself.
	// Deep-link params (?view=, ?date=) also bypass the redirect so users can
	// link directly to month/week/day views.
	const hasViewParams =
		event.url.searchParams.has('view') || event.url.searchParams.has('date');
	if (
		userSettings?.defaultView === 'dashboard' &&
		!event.url.searchParams.has('dashboardView') &&
		!hasViewParams
	) {
		return redirect(302, '/calendar/dashboard');
	}

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

	const userZone = await getUserZone(userId);

	if (showAds) {
		const now = zonedNow(userZone);
		adEventsData = await getAdEventsForUser(userId, now.month, now.year);
	}

	// Open tasks with due dates render as distinct chips on month-view days.
	// Overdue Recurring Tasks first stick to today (cursor v3).
	await syncRecurringCursors(userId, familyId, userZone);
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

	const [parsedUserEvents, parsedFamilyEvents] = await Promise.all([
		parseEvents(await expandEventsForUser(userEvents)),
		parseEvents(await expandEventsForUser(familyEventsData))
	]);
	// Current user's RSVP per event (keyed on masterId) so views can tint
	// going / maybe events and dim ones you can't attend.
	const [userEventsFinal, familyEventsFinal] = await Promise.all([
		attachRsvpStatus(userId, parsedUserEvents),
		attachRsvpStatus(userId, parsedFamilyEvents)
	]);
	// Compact per-family-event "who's going" summary for chip indicators.
	const [userEventsWithAttendance, familyEventsWithAttendance] = await Promise.all([
		attachAttendanceSummaries(userEventsFinal),
		attachAttendanceSummaries(familyEventsFinal)
	]);

	const verseTranslation = userSettings?.verseTranslation ?? 'esv';
	const dailyVerse = userSettings?.showDailyVerse ? await getTodayVerse(verseTranslation) : null;

	return {
		userEvents: userEventsWithAttendance.map((e) => ({ ...e, color: userCalendarColor })),
		familyEvents: familyEventsWithAttendance.map((e) => ({ ...e, color: familyCalendarColor })),
		adEvents: parseEvents(adEventsData).map(e => ({ ...e, color: '#f59e0b' })),
		dueTasks,
		userSettings,
		userCalendarColor,
		familyCalendarColor,
		showAds,
		familyMembers: familyMembersList,
		calendarIds,
		dailyVerse
	};
};
