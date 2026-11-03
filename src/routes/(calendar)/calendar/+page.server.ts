// Intl.DateTimeFormat().resolvedOptions().timeZone
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { events, type CalendarEvent } from '$lib/server/db/schema';
import {
	getFamilyCalendarInfo,
	loadDailyVerse,
	loadSponsoredEvents,
	personalCalendarColor,
	toSponsoredDisplay,
	PERSONAL_CALENDAR_NAME
} from '$lib/server/services/calendarData';
import { and, eq, isNotNull, isNull, lte, or, gte } from 'drizzle-orm';
import { ensurePersonalCalendar } from '$lib/server/db/actions/calendar';
import { shouldServeAds } from '$lib/server/services/adService';
import {
	expandEventsForUser,
	monthGridWindow,
	parseEvents,
	attachRsvpStatus,
	attachAttendanceSummaries,
	attachCreatorNames
} from '$lib/server/services/eventDisplayService';
import { getTasksForUser } from '$lib/server/db/actions/tasks';
import { listCategoryOptions } from '$lib/server/db/actions/taskCategories';
import { zoneFromSettings, zonedNow } from '$lib/server/utils/userTimezone';
import { GUEST_MERGE_COOKIE } from '$lib/server/services/guestMergeService';
import { guard } from '$lib/server/utils/guard';
import { isRegisteredAccount } from '$lib/utils/anonymous';

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
	// Only a registered account merges a guest — an Anonymous Account's
	// placeholder email is non-null since #196 (#241).
	if (stashCookie && isRegisteredAccount(event.locals.user) && stashCookie !== userId) {
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
	// #282: one roster for the person filter AND every view's EventModal edit
	// form — so it keeps first/last names (the picker names members by them).
	const familyMembersList = (parentData.familyMembers ?? []).map((m) => ({
		id: m.userId,
		name: m.firstName,
		firstName: m.firstName,
		lastName: m.lastName,
		email: m.email ?? '',
		userId: m.userId
	}));

	// Opt-in landing: with Default View set to "Dashboard", /calendar sends the
	// user to the Day Dashboard. ?dashboardView=1 is the escape hatch the
	// dashboard's "Back to Calendar" link and the nav Calendar buttons use
	// to show the calendar itself (#056).
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

	// #282: the event modal's task tab suggests the viewer's categories.
	// listCategoryOptions never throws (a failed read is []).
	const taskCategoriesP = listCategoryOptions(userId);

	// Wave 1 (#041): personal calendar, family scope, ads, verse are
	// independent (settings/familyId/zone already in hand) — one wave.
	const userCalendarColor = personalCalendarColor(userSettings);
	// Zone derives from the layout's settings row — no third SELECT (#041).
	const userZone = zoneFromSettings(userSettings) ?? 'UTC';
	const [personalG, familyG, adsG, verseG] = await Promise.all([
		guard('calendar', { userCalendar: null, userEvents: [] }, async () => {
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
		}),
		guard(
			'family',
			{ familyEventsData: [], familyCalendarColor: '#e0ffff', calendarIds: [] },
			async () => {
				if (!familyId) {
					return { familyEventsData: [], familyCalendarColor: '#e0ffff', calendarIds: [] };
				}
				{
					// Name + colour + which calendar: shared with GET /api/calendars (#292 G2).
					const famCal = await getFamilyCalendarInfo(familyId);
					const color = famCal.color;

					let evts: CalendarEvent[] = [];
					const ids: { id: string; name: string; color: string }[] = [];
					if (famCal.calendar) {
						evts = await db
							.select()
							.from(events)
							.where(
								and(
									eq(events.calendarId, famCal.calendar.id),
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
						ids.push({ id: famCal.calendar.id, name: famCal.name, color });
					}

					// Roster comes from the group layout (#041) — mapped once at the top.
					return {
						familyEventsData: evts,
						familyCalendarColor: color,
						calendarIds: ids
					};
				}
			}
		),
		// The ad gate is one field on the settings row the layout already
		// loaded — no second consent table, no extra SELECT (#088).
		// Shared with GET /api/sponsored-events (#292 G6).
		guard('ads', { adEventsData: [] as CalendarEvent[] }, async () => {
			const now = zonedNow(userZone);
			return { adEventsData: await loadSponsoredEvents(userId, userSettings, now.month, now.year) };
		}),
		guard('verse', null, async () => {
			// The verse's visibility is a function of BOTH persisted facts — the
			// `showDailyVerse` setting and the Dashboard Module switch — so it
			// asks the one shared answer rather than reading one of them (109).
			// This loader used to read only the setting, and a user who hid the
			// verse in /account was still served one here. Shared with
			// GET /api/daily-verse (#292 G7).
			const { verse, warning } = await loadDailyVerse(userSettings, familyId);
			warn(warning);
			return verse;
		})
	]);
	warn(personalG.error);
	warn(familyG.error);
	warn(adsG.error);
	warn(verseG.error);
	const userCalendar = personalG.data.userCalendar;
	const userEvents: CalendarEvent[] = personalG.data.userEvents;
	const familyEventsData: CalendarEvent[] = familyG.data.familyEventsData;
	const familyCalendarColor: string = familyG.data.familyCalendarColor;
	const calendarIds: { id: string; name: string; color: string }[] = [
		...(userCalendar
			? [{ id: userCalendar.id, name: PERSONAL_CALENDAR_NAME, color: userCalendarColor }]
			: []),
		...familyG.data.calendarIds
	];
	const showAds = shouldServeAds(userSettings);
	const adEventsData: CalendarEvent[] = adsG.data.adEventsData;
	const dailyVerse = verseG.data;

	// Streamed below the shell (#041): tasks + events resolve after first
	// paint instead of blocking the whole response. Each leg degrades to
	// its fallback independently (same contract as the old guard()s).
	const taskPipeline = (async () => {
		try {
			// Cursor pin (110) now lives inside getTasksForUser.
			const allTasks = await getTasksForUser(userId, familyId, userZone);
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
						// Which calendar this Task rides with (#069), so
						// hiding that calendar takes its due Tasks with it.
						// A Task with no parent event belongs to the viewer's
						// own personal calendar — the only one they author.
						calendarId: t.eventCalendarId ?? userCalendar?.id ?? null,
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
				parseEvents(await expandEventsForUser(userEvents, gridWindow, userZone), userZone),
				parseEvents(await expandEventsForUser(familyEventsData, gridWindow, userZone), userZone)
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
		adEvents: toSponsoredDisplay(adEventsData, userZone),
		userSettings,
		userCalendarColor,
		familyCalendarColor,
		showAds,
		familyMembers: familyMembersList,
		taskCategories: await taskCategoriesP,
		familyId,
		calendarIds,
		dailyVerse,
		loadWarnings
	};
};
