import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { CalendarEvent } from '$lib/server/db/schema';
import {
	getTasksForUser,
	getTasksForFamily,
	syncRecurringCursors
} from '$lib/server/db/actions/tasks';
import {
	rankTop3,
	getUserDayCalendar,
	getFamilyDayEvents,
	getFamilyAttendanceForEvents,
	getKidsScheduleAttendance,
	getCompletionTimestamps,
	getRecurringDayCompletions,
	mergeDayCompletions,
	type RankableTask
} from '$lib/server/db/actions/dashboard';
import {
	getFamilyModuleSwitches,
	composeModuleVisibility
} from '$lib/server/db/actions/dashboardModules';
import { zoneFromSettings, zonedNow } from '$lib/server/utils/userTimezone';
import { guard } from '$lib/server/utils/guard';
import {
	expandEventsForUser,
	parseEvents,
	attachRsvpStatus,
	attachAttendanceSummaries
} from '$lib/server/services/eventDisplayService';
import { getTodayVerse } from '$lib/server/services/verseService';
import { computeWeeklyStreak } from '$lib/server/services/streakService';
import { toIsoTimestamp } from '$lib/server/db/actions/taskStats';
import { DateTime } from 'luxon';

/** One row for the Kids' Schedule card: a day event with child attendees. */
type KidsScheduleEvent = {
	id: string;
	title: string;
	start: string;
	end: string | null;
	allDay: boolean;
	location: string | null;
	kids: string[];
};

/** A parsed-event time: ISO string, Date instance, or missing. */
type ParsedEventTime = string | Date | null | undefined;

/** Coerce a parsed-event time (string | Date | null) to an ISO string. */
function toIsoString(v: ParsedEventTime): string | null {
	if (v instanceof Date) return v.toISOString();
	return v ? String(v) : null;
}

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	const userId = event.locals.user.id;
	// Section loads are guarded: a failing model degrades to its fallback and
	// records a warning instead of 500ing the whole page.
	const loadWarnings: string[] = [];
	const warn = (label: string | null) => {
		if (label) loadWarnings.push(label);
	};

	// Settings + family scope come from the group layout (#042) — no refetch.
	const parentData = await event.parent();
	const userSettings = parentData.userSettings;
	const familyId = parentData.familyId;
	const zone = zoneFromSettings(userSettings) ?? 'UTC';
	const now = zonedNow(zone);
	// The dashboard can be opened for any day via ?date=YYYY-MM-DD (interpreted
	// in the user's zone); absent or invalid, it shows today.
	let dayStart = now.startOf('day');
	const dateParam = event.url.searchParams.get('date');
	if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
		const parsed = DateTime.fromISO(dateParam, { zone });
		if (parsed.isValid) dayStart = parsed.startOf('day');
	}
	const dayEnd = dayStart.endOf('day');
	const dayStartIso = dayStart.toISO()!;
	const isToday = dayStart.hasSame(now, 'day');

	// Effective per-module visibility: family master switch AND this user's
	// own hidden list. Family-heavy fetches below are skipped when no family
	// module is visible, so hidden-low-priority families don't pay for them.
	const switchesG = await guard('settings', {}, async () =>
		familyId ? await getFamilyModuleSwitches(familyId) : {}
	);
	warn(switchesG.error);
	const familySwitches = switchesG.data;
	const modules = composeModuleVisibility(
		familySwitches,
		userSettings?.hiddenDashboardModules ?? []
	);
	const familyModulesVisible = modules.board || modules.memberStrip || modules.kids;

	// Streamed legs (#042): everything below resolves after first paint.
	// Each leg degrades to its fallback independently (same contract as the
	// old guard()s). Overdue Recurring Tasks stick to today first (cursor
	// v3), so "today" surfaces the same pinned occurrences the calendar would.
	const taskLeg = (async () => {
		try {
			await syncRecurringCursors(userId, familyId, zone);
			const [userTasks, familyTasks] = await Promise.all([
				getTasksForUser(userId, familyId),
				familyId && familyModulesVisible ? getTasksForFamily(familyId) : Promise.resolve([])
			]);
			// SAFETY: null must widen to the string|null union shared with the catch branch.
			return { userTasks, familyTasks, warning: null as string | null };
		} catch {
			// SAFETY: literal must widen to the string|null union shared with the ok branch.
			return { userTasks: [], familyTasks: [], warning: 'tasks' as string | null };
		}
	})();

	// Events for the day, from the personal + (optional) family calendar.
	// One guarded pipeline so an expansion/RSVP failure still leaves tasks
	// and the verse on screen.
	// Day window (#042): expand only the viewed day (±1d tz pad) instead of
	// ±2y — the day filter below then keeps ~everything expansion yields.
	const dayWindow = {
		start: dayStart.minus({ days: 1 }).toJSDate(),
		end: dayEnd.plus({ days: 1 }).toJSDate()
	};
	const eventLeg = (async () => {
		try {
			const { events: userEventsData } = await getUserDayCalendar(userId);
			let familyEventsData: CalendarEvent[] = [];
			if (familyId) {
				familyEventsData = await getFamilyDayEvents(familyId);
			}

			const window = {
				...dayWindow,
				startIso: dayWindow.start.toISOString(),
				endIso: dayWindow.end.toISOString()
			};
			const [parsedUser, parsedFamily] = await Promise.all([
				parseEvents(await expandEventsForUser(userEventsData, window), zone),
				parseEvents(await expandEventsForUser(familyEventsData, window), zone)
			]);

			// Current user's RSVP per event, so the glance card can tint going /
			// maybe events and dim ones the user can't attend.
			const [userWithRsvp, familyWithRsvp] = await Promise.all([
				attachRsvpStatus(userId, parsedUser),
				attachRsvpStatus(userId, parsedFamily)
			]);

			const userSettingsColor = userSettings?.color || '#fa8072';
			const dayEventsRaw = [
				...userWithRsvp.map((e) => ({
					...e,
					color: userSettingsColor,
					source: 'own' as const
				})),
				...familyWithRsvp.map((e) => ({
					...e,
					color: '#e0ffff',
					source: 'family' as const
				}))
			].filter((e) => {
				const d = e.date instanceof Date ? e.date : new Date(e.date);
				return d >= dayStart.toJSDate() && d < dayEnd.toJSDate();
			});

			// Compact "who's going" summary per event so glance rows and the member
			// strip can show family attendance.
			const dayEvents = await attachAttendanceSummaries(
				dayEventsRaw.map((e) => ({ ...e, masterId: e.masterId ?? e.id }))
			);
			// SAFETY: null must widen to the string|null union shared with the catch branch.
			return { dayEvents, warning: null as string | null };
		} catch {
			// SAFETY: literal must widen to the string|null union shared with the ok branch.
			return { dayEvents: [], warning: 'events' as string | null };
		}
	})();

	// Family roster + per-member status for the Member Strip, plus the
	// attendance join for the "in an event today" dot. Attendance rows are
	// keyed by the master event id, so the join uses masterId (occurrences
	// of a series share the master's attendance).
	// Kids' Schedule: the viewed day's family events with a Child attendee
	// (memberType='child', RSVP not declined) — decision 7.
	const familyLeg = async (
		familyTasks: Awaited<typeof taskLeg>['familyTasks'],
		dayEvents: Awaited<typeof eventLeg>['dayEvents']
	) => {
		try {
			if (familyId && familyModulesVisible) {
				const roster = parentData.familyMembers ?? [];
				const childMembers = roster.filter((m) => m.memberType === 'child');
				const familyEventIds = dayEvents
					.filter((e) => e.source === 'family')
					.map((e) => e.masterId ?? e.id);
				const attendanceRows = familyEventIds.length
					? await getFamilyAttendanceForEvents(familyEventIds)
					: [];
				const attending = new Set(attendanceRows.map((a) => a.userId!).filter(Boolean));
				const status = roster.map((m) => {
					const owned = familyTasks.filter(
						(t) =>
							!t.completedAt &&
							(t.assignedTo === m.userId || (!t.assignedTo && t.userId === m.userId))
					);
					return {
						userId: m.userId,
						firstName: m.firstName,
						lastName: m.lastName,
						openTasksToday: owned.length,
						attendingToday: attending.has(m.userId)
					};
				});

				let kids: KidsScheduleEvent[] = [];
				if (modules.kids && childMembers.length > 0) {
					const childIds = new Set(childMembers.map((m) => m.userId));
					const childNameByUserId = new Map(
						childMembers.map((m) => [m.userId, m.firstName.trim() || m.userId])
					);
					const kidsAttendance = familyEventIds.length
						? await getKidsScheduleAttendance(familyEventIds, [...childIds])
						: [];
					const kidsByEvent = new Map<string, string[]>();
					for (const row of kidsAttendance) {
						if (!row.userId || !childIds.has(row.userId)) continue;
						const list = kidsByEvent.get(row.eventId) ?? [];
						// Dedupe by userId so two children sharing a first name don't collapse.
						if (!list.includes(row.userId)) list.push(row.userId);
						kidsByEvent.set(row.eventId, list);
					}
					kids = dayEvents
						.filter((e) => e.source === 'family' && kidsByEvent.has(e.masterId ?? e.id))
						.map((e) => ({
							id: e.id,
							title: e.title,
							start: toIsoString(e.start) ?? '',
							end: toIsoString(e.end),
							allDay: e.allDay,
							location: e.location ?? null,
							kids: (kidsByEvent.get(e.masterId ?? e.id) ?? []).map(
								(userId) => childNameByUserId.get(userId) ?? userId
							)
						}));
				}
				// SAFETY: null must widen to the string|null union shared with the catch branch.
				return {
					familyMembers: roster,
					memberStatus: status,
					kidsSchedule: kids,
					warning: null as string | null
				};
			}
			// SAFETY: null must widen to the string|null union shared with the catch branch.
			return {
				familyMembers: [],
				memberStatus: [],
				kidsSchedule: [],
				warning: null as string | null
			};
		} catch {
			// SAFETY: literal must widen to the string|null union shared with the ok branch.
			return {
				familyMembers: [],
				memberStatus: [],
				kidsSchedule: [],
				warning: 'family' as string | null
			};
		}
	};

	// Day-at-a-glance bounds (shared by the wins + streak legs below).
	const dayStartJs = dayStart.toJSDate();
	const dayEndJs = dayEnd.toJSDate();

	// Recurring check-offs never set the task row's completedAt (the cursor
	// rolls forward), so they're recovered from the completion-history table.
	const winsLeg = (async () => {
		try {
			const rows = await getRecurringDayCompletions(userId, dayStartJs, dayEndJs);
			// SAFETY: null must widen to the string|null union shared with the catch branch.
			return { rows, warning: null as string | null };
		} catch {
			// SAFETY: literal must widen to the string|null union shared with the ok branch.
			return { rows: [], warning: 'task-wins' as string | null };
		}
	})();

	const streakLeg = (async () => {
		try {
			const completionRows = await getCompletionTimestamps(userId);
			const streak = computeWeeklyStreak(
				completionRows.map((r) => toIsoTimestamp(r.completedAt)).filter(Boolean),
				now.toISO()!
			);
			// SAFETY: null must widen to the string|null union shared with the catch branch.
			return { streak: streak.current, warning: null as string | null };
		} catch {
			// Previously an unguarded 500; now degrades to a zero streak.
			// SAFETY: literal must widen to the string|null union shared with the ok branch.
			return { streak: 0, warning: 'streak' as string | null };
		}
	})();

	// One streamed promise: header data above paints first; everything
	// below fills in when the legs resolve.
	const dashboardData = (async () => {
		const [t, e, w, s] = await Promise.all([taskLeg, eventLeg, winsLeg, streakLeg]);
		const { userTasks, familyTasks } = t;
		const { dayEvents } = e;
		// The board shows only open tasks; completed ones vanish after toggle.
		const openFamilyTasks = familyTasks.filter((f) => !f.completedAt);
		const fam = await familyLeg(familyTasks, dayEvents);
		// Top-3 ranking: mine-first → priority → overdue → due-today → next,
		// bucketed relative to the viewed day (rankTop3 returns bare rows).
		// SAFETY: userTasks rows are TaskWithTags, which carries every RankableTask field.
		const top3 = rankTop3(userTasks as RankableTask[], userId, { todayStartIso: dayStartIso }).map(
			(row) => {
				const src = userTasks.find((u) => u.id === row.id);
				return {
					...row,
					assigneeFirstName: src?.assigneeFirstName,
					assigneeLastName: src?.assigneeLastName
				};
			}
		);
		const oneOffCompleted = userTasks
			.filter(
				(row) =>
					row.completedAt &&
					new Date(row.completedAt) >= dayStartJs &&
					new Date(row.completedAt) < dayEndJs
			)
			.map((row) => ({
				id: row.id,
				title: row.title,
				completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null
			}));
		const completedToday = mergeDayCompletions(oneOffCompleted, w.rows);
		const doneForDay = completedToday.length;
		const openForDay = userTasks.filter(
			(row) => !row.completedAt && row.dueDate && new Date(row.dueDate) < dayEndJs
		).length;
		return {
			userTasks,
			familyTasks: openFamilyTasks,
			familyMembers: fam.familyMembers,
			memberStatus: fam.memberStatus,
			dayEvents,
			top3,
			glance: { doneToday: doneForDay, openToday: openForDay, weekStreak: s.streak },
			completedToday,
			kidsSchedule: fam.kidsSchedule,
			warnings: [t.warning, e.warning, w.warning, s.warning, fam.warning].filter(
				(x): x is string => x !== null
			)
		};
	})();

	const verseTranslation = userSettings?.verseTranslation ?? 'esv';
	const verseG = await guard('verse', null, async () =>
		userSettings?.showDailyVerse ? await getTodayVerse(verseTranslation) : null
	);
	// Verse gets its own friendly label: the banner template reads
	// "Couldn't load {labels} just now — …", so the bare 'verse' label
	// would render as "Couldn't load verse". (A full-sentence warning
	// would need a DayDashboard banner touch — out of scope for this lane.)
	if (verseG.error) loadWarnings.push("today's verse");
	const dailyVerse = verseG.data;

	return {
		zone,
		dayISO: dayStartIso,
		isToday,
		meId: userId,
		userSettings,
		familyId,
		modules,
		dashboardData,
		dailyVerse,
		loadWarnings
	};
};
