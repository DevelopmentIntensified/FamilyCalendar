// Intl.DateTimeFormat().resolvedOptions().timeZone
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { calendars, events, families, type CalendarEvent } from '$lib/server/db/schema';
import { and, eq, isNotNull, isNull, lte, or, gte } from 'drizzle-orm';
import { ensurePersonalCalendar } from '$lib/server/db/actions/calendar';
import {
	getAdEventsForUser,
	checkUserAdConsent,
	type AdDisplayEvent
} from '$lib/server/services/adService';
import {
	expandEventsForUser,
	monthGridWindow,
	parseEvents,
	attachRsvpStatus,
	attachAttendanceSummaries,
	attachCreatorNames
} from '$lib/server/services/eventDisplayService';
import { getTasksForUser, syncRecurringCursors } from '$lib/server/db/actions/tasks';
import { zoneFromSettings, zonedNow } from '$lib/server/utils/userTimezone';
import { getTodayVerse } from '$lib/server/services/verseService';
import { GUEST_MERGE_COOKIE } from '$lib/server/services/guestMergeService';
import { guard } from '$lib/server/utils/guard';

/** Project an ad display event onto the stored event row shape (stored-only fields are null). */
function toCalendarEvent(ad: AdDisplayEvent): CalendarEvent {
	return {
		...ad,
		recurrenceByDay: null,
		recurrenceCount: null,
		recurrenceUntil: null,
		reminderMinutes: null,
		mirrorOf: null
	};
}

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	const userId = event.locals.user.id;
	// Visible-month window (#041): expansion + one-off SELECTs cover the
	// month grid (?date= or today) instead of ±2 years.
	const gridWindow = monthGridWindow(event.url.searchParams.get('date'));
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

	// Settings already loaded by the group layout — reuse via parent() instead
	// of a second SELECT on every page load (#041).
	const parentData = await event.parent();
	const userSettings = parentData.userSettings;
	// Family scope comes from the group layout (#041) — no refetch.
	const familyId = parentData.familyId;
	const familyMembersList = (parentData.familyMembers ?? []).map((m) => ({
		id: m.userId,
		name: m.firstName,
		email: m.email ?? '',
		userId: m.userId
	}));

	// Opt-in landing: with Default View set to "Dashboard", /calendar sends the
	// user to the Day Dashboard. ?dashboardView=1 is the escape hatch the
	// dashboard's "Back to Calendar" link uses to show the calendar itself.
	// Deep-link params (?view=, ?date=) also bypass the redirect so users can
	// link directly to month/week/day views.
	const hasViewParams = event.url.searchParams.has('view') || event.url.searchParams.has('date');
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
				.where(
					and(
						eq(events.calendarId, userCalendar.id),
						or(
							isNotNull(events.recurrenceFrequency),
							and(
								lte(events.start, gridWindow.endIso),
								or(
									gte(events.end, gridWindow.startIso),
									and(isNull(events.end), gte(events.start, gridWindow.startIso))
								)
							)
						)
					)
				)
				.orderBy(events.start);
		}
		return { userCalendar, userEvents };
	});
	warn(personalG.error);
	const userCalendar = personalG.data.userCalendar;
	const userEvents: CalendarEvent[] = personalG.data.userEvents;

	let familyEventsData: CalendarEvent[] = [];
	let familyCalendarColor = '#e0ffff';

	const userCalendarColor = userSettings?.color || '#fa8072';
	let calendarIds: { id: string; name: string; color: string }[] = [];

	if (userCalendar) {
		calendarIds.push({ id: userCalendar.id, name: 'Personal Calendar', color: userCalendarColor });
	}

	if (familyId) {
		const familyG = await guard(
			'family',
			{ familyEventsData, familyCalendarColor, calendarIds },
			async () => {
				const [family] = await db.select().from(families).where(eq(families.id, familyId));
				const color = family?.color || '#e0ffff';

				let evts: CalendarEvent[] = [];
				const ids = [...calendarIds];
				const familyCals = await db
					.select()
					.from(calendars)
					.where(eq(calendars.familyId, familyId));
				if (familyCals.length > 0) {
					evts = await db
						.select()
						.from(events)
						.where(
							and(
								eq(events.calendarId, familyCals[0].id),
								or(
									isNotNull(events.recurrenceFrequency),
									and(
										lte(events.start, gridWindow.endIso),
										or(
											gte(events.end, gridWindow.startIso),
											and(isNull(events.end), gte(events.start, gridWindow.startIso))
										)
									)
								)
							)
						)
						.orderBy(events.start);
					ids.push({ id: familyCals[0].id, name: family?.name || 'Family Calendar', color });
				}

				// Roster comes from the group layout (#041) — mapped once at the top.
				return {
					familyEventsData: evts,
					familyCalendarColor: color,
					calendarIds: ids
				};
			}
		);
		warn(familyG.error);
		familyEventsData = familyG.data.familyEventsData;
		familyCalendarColor = familyG.data.familyCalendarColor;
		calendarIds = familyG.data.calendarIds;
	}

	// Zone derives from the layout's settings row — no third SELECT (#041).
	const userZone = zoneFromSettings(userSettings) ?? 'UTC';

	const adsG = await guard('ads', { hasAdConsent: false, adEventsData: [] }, async () => {
		const hasAdConsent = await checkUserAdConsent(userId);
		const show = hasAdConsent && (userSettings?.showAdsAsEvents ?? false);
		let adEventsData: CalendarEvent[] = [];
		if (show) {
			const now = zonedNow(userZone);
			adEventsData = (await getAdEventsForUser(userId, now.month, now.year)).map(toCalendarEvent);
		}
		return { hasAdConsent, adEventsData };
	});
	warn(adsG.error);
	const showAds = adsG.data.hasAdConsent && (userSettings?.showAdsAsEvents ?? false);
	const adEventsData: CalendarEvent[] = adsG.data.adEventsData;

	// Streamed below the shell (#041): tasks + events resolve after first
	// paint instead of blocking the whole response. Each leg degrades to
	// its fallback independently (same contract as the old guard()s).
	const taskPipeline = (async () => {
		try {
			await syncRecurringCursors(userId, familyId, userZone);
			const allTasks = await getTasksForUser(userId, familyId);
			const tasks = allTasks.flatMap((t) => {
				if (!t.dueDate || t.completedAt) return [];
				return [
					{
						id: t.id,
						title: t.title,
						dueDate: new Date(t.dueDate),
						recurrenceFrequency: t.recurrenceFrequency,
						recurrenceInterval: t.recurrenceInterval,
						completionCount: t.completionCount,
						// Richer fields for the task detail popup (calendar views).
						priority: t.priority,
						notes: t.notes,
						tags: t.tags,
						assignedTo: t.assignedTo,
						assigneeFirstName: t.assigneeFirstName ?? null,
						assigneeLastName: t.assigneeLastName ?? null,
						eventTitle: t.eventTitle ?? null
					}
				];
			});
			// SAFETY: null must widen to the string|null union shared with the catch branch.
			return { tasks, warning: null as string | null };
		} catch {
			// SAFETY: literal must widen to the string|null union shared with the ok branch.
			return { tasks: [], warning: 'tasks' as string | null };
		}
	})();

	const eventPipeline = (async () => {
		try {
			const [parsedUserEvents, parsedFamilyEvents] = await Promise.all([
				parseEvents(await expandEventsForUser(userEvents, gridWindow), userZone),
				parseEvents(await expandEventsForUser(familyEventsData, gridWindow), userZone)
			]);
			// Current user's RSVP per event (keyed on masterId) so views can tint
			// going / maybe events and dim ones you can't attend.
			const [userEventsFinal, familyEventsFinal] = await Promise.all([
				attachRsvpStatus(userId, parsedUserEvents),
				attachRsvpStatus(userId, parsedFamilyEvents)
			]);
			// Compact per-family-event "who's going" summary for chip indicators.
			// Creator first name attaches to FAMILY events only — personal events
			// show no creator chip.
			const [userEventsWithAttendance, familyEventsWithAttendance] = await Promise.all([
				attachAttendanceSummaries(userEventsFinal),
				attachCreatorNames(await attachAttendanceSummaries(familyEventsFinal))
			]);
			// SAFETY: null must widen to the string|null union shared with the catch branch.
			return {
				user: userEventsWithAttendance,
				family: familyEventsWithAttendance,
				warning: null as string | null
			};
		} catch {
			// SAFETY: literal must widen to the string|null union shared with the ok branch.
			return { user: [], family: [], warning: 'events' as string | null };
		}
	})();

	const verseTranslation = userSettings?.verseTranslation ?? 'esv';
	const verseG = await guard('verse', null, async () =>
		userSettings?.showDailyVerse ? await getTodayVerse(verseTranslation) : null
	);
	warn(verseG.error);
	const dailyVerse = verseG.data;

	// One streamed promise: shell (calendars, roster, settings) paints
	// first; grid + chips fill in when the pipelines resolve.
	const calendarData = (async () => {
		const [ev, td] = await Promise.all([eventPipeline, taskPipeline]);
		return {
			user: ev.user.map((e) => ({ ...e, color: userCalendarColor })),
			family: ev.family.map((e) => ({ ...e, color: familyCalendarColor })),
			dueTasks: td.tasks,
			warnings: [ev.warning, td.warning].filter((w): w is string => w !== null)
		};
	})();

	return {
		calendarData,
		adEvents: parseEvents(adEventsData, userZone).map((e) => ({ ...e, color: '#f59e0b' })),
		userSettings,
		userCalendarColor,
		familyCalendarColor,
		showAds,
		familyMembers: familyMembersList,
		familyId,
		calendarIds,
		dailyVerse,
		loadWarnings
	};
};
