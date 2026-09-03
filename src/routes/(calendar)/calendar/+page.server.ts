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
import { eq } from 'drizzle-orm';
import { ensurePersonalCalendar } from '$lib/server/db/actions/calendar';
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
import { guard } from '$lib/server/utils/guard';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	let userId = event.locals.user.id;
	// Section loads are guarded: a failing model degrades to its fallback and
	// records a warning instead of 500ing the whole page.
	const loadWarnings: string[] = [];
	const warn = (label: string | null) => {
		if (label) loadWarnings.push(label);
	};

	// Pending guest-merge from a recent login? Prompt before anything else.
	// A failing merge check degrades to "no merge" rather than a 500.
	const stashCookie = event.cookies.get(GUEST_MERGE_COOKIE);
	if (stashCookie && event.locals.user.email !== null && stashCookie !== userId) {
		const mergeG = await guard('merge-check', false, async () => {
			const { isClaimableGuest } = await import('$lib/server/services/guestMergeService');
			return await isClaimableGuest(stashCookie);
		});
		warn(mergeG.error);
		if (mergeG.data) {
			return redirect(302, '/merge-guest');
		}
		event.cookies.delete(GUEST_MERGE_COOKIE, { path: '/' });
	}

	const settingsG = await guard('settings', null, () => getUserSettings(userId));
	warn(settingsG.error);
	let userSettings = settingsG.data;

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

	const personalG = await guard('calendar', { userCalendar: null, userEvents: [] }, async () => {
		const userCalendar = await ensurePersonalCalendar(userId);
		let userEvents: CalendarEvent[] = [];
		if (userCalendar) {
			userEvents = await db
				.select()
				.from(events)
				.where(eq(events.calendarId, userCalendar.id))
				.orderBy(events.start);
		}
		return { userCalendar, userEvents };
	});
	warn(personalG.error);
	const userCalendar = personalG.data.userCalendar;
	let userEvents: CalendarEvent[] = personalG.data.userEvents;

	const familyIdG = await guard('family', null, () => getUserFamilyId(userId));
	warn(familyIdG.error);
	const familyId = familyIdG.data;

	let familyEventsData: CalendarEvent[] = [];
	let familyCalendarColor = '#e0ffff';

	let familyMembersList: { id: string; name: string; email: string; userId: string }[] = [];
	const userCalendarColor = userSettings?.color || '#fa8072';
	let calendarIds: { id: string; name: string; color: string }[] = [];

	if (userCalendar) {
		calendarIds.push({ id: userCalendar.id, name: 'Personal Calendar', color: userCalendarColor });
	}

	if (familyId && typeof familyId === 'string') {
		const familyG = await guard(
			'family',
			{ familyEventsData, familyCalendarColor, familyMembersList, calendarIds },
			async () => {
				const [family] = await db.select().from(families).where(eq(families.id, familyId));
				const color = family?.color || '#e0ffff';

				let evts: CalendarEvent[] = [];
				const ids = [...calendarIds];
				let familyCals = await db.select().from(calendars).where(eq(calendars.familyId, familyId));
				if (familyCals.length > 0) {
					evts = await db
						.select()
						.from(events)
						.where(eq(events.calendarId, familyCals[0].id))
						.orderBy(events.start);
					ids.push({ id: familyCals[0].id, name: family?.name || 'Family Calendar', color });
				}

				const members = await getFamilyRoster(familyId);

				// Anonymous members have no email yet — render as blank.
				const memberList = members.map((m) => ({
					id: m.userId,
					name: m.firstName,
					email: m.email ?? '',
					userId: m.userId
				}));
				return {
					familyEventsData: evts,
					familyCalendarColor: color,
					familyMembersList: memberList,
					calendarIds: ids
				};
			}
		);
		warn(familyG.error);
		familyEventsData = familyG.data.familyEventsData;
		familyCalendarColor = familyG.data.familyCalendarColor;
		familyMembersList = familyG.data.familyMembersList;
		calendarIds = familyG.data.calendarIds;
	}

	const zoneG = await guard('settings', 'UTC', () => getUserZone(userId));
	warn(zoneG.error);
	const userZone = zoneG.data;

	const adsG = await guard('ads', { hasAdConsent: false, adEventsData: [] }, async () => {
		const hasAdConsent = await checkUserAdConsent(userId);
		const show = hasAdConsent && (userSettings?.showAdsAsEvents ?? false);
		let adEventsData: CalendarEvent[] = [];
		if (show) {
			const now = zonedNow(userZone);
			adEventsData = await getAdEventsForUser(userId, now.month, now.year);
		}
		return { hasAdConsent, adEventsData };
	});
	warn(adsG.error);
	const showAds = adsG.data.hasAdConsent && (userSettings?.showAdsAsEvents ?? false);
	let adEventsData: CalendarEvent[] = adsG.data.adEventsData;

	// Open tasks with due dates render as distinct chips on month-view days.
	// Overdue Recurring Tasks first stick to today (cursor v3).
	const tasksG = await guard('tasks', [], async () => {
		await syncRecurringCursors(userId, familyId, userZone);
		const allTasks = await getTasksForUser(userId, familyId);
		return allTasks
			.filter((t) => t.dueDate && !t.completedAt)
			.map((t) => ({
				id: t.id,
				title: t.title,
				dueDate: new Date(t.dueDate as unknown as string),
				recurrenceFrequency: t.recurrenceFrequency,
				recurrenceInterval: t.recurrenceInterval,
				completionCount: t.completionCount,
				// Richer fields for the task detail popup (calendar views).
				priority: t.priority,
				notes: t.notes,
				tags: t.tags,
				assignedTo: t.assignedTo,
				assigneeFirstName: (t as { assigneeFirstName?: string | null }).assigneeFirstName ?? null,
				assigneeLastName: (t as { assigneeLastName?: string | null }).assigneeLastName ?? null,
				eventTitle: (t as { eventTitle?: string | null }).eventTitle ?? null
			}));
	});
	warn(tasksG.error);
	const dueTasks = tasksG.data;

	const eventsG = await guard('events', { user: [], family: [] }, async () => {
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
		return { user: userEventsWithAttendance, family: familyEventsWithAttendance };
	});
	warn(eventsG.error);

	const verseTranslation = userSettings?.verseTranslation ?? 'esv';
	const verseG = await guard('verse', null, async () =>
		userSettings?.showDailyVerse ? await getTodayVerse(verseTranslation) : null
	);
	warn(verseG.error);
	const dailyVerse = verseG.data;

	return {
		userEvents: eventsG.data.user.map((e) => ({ ...e, color: userCalendarColor })),
		familyEvents: eventsG.data.family.map((e) => ({ ...e, color: familyCalendarColor })),
		adEvents: parseEvents(adEventsData).map(e => ({ ...e, color: '#f59e0b' })),
		dueTasks,
		userSettings,
		userCalendarColor,
		familyCalendarColor,
		showAds,
		familyMembers: familyMembersList,
		calendarIds,
		dailyVerse,
		loadWarnings
	};
};
