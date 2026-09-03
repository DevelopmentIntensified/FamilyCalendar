import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { CalendarEvent, Meal } from '$lib/server/db/schema';
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import { getFamilyRoster, getUserFamilyId } from '$lib/server/db/actions/families';
import { getMealsByDate } from '$lib/server/db/actions/meals';
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
	type RankableTask
} from '$lib/server/db/actions/dashboard';
import {
	getFamilyModuleSwitches,
	composeModuleVisibility
} from '$lib/server/db/actions/dashboardModules';
import { getUserZone, zonedNow } from '$lib/server/utils/userTimezone';
import { expandEventsForUser, parseEvents, attachRsvpStatus, attachAttendanceSummaries } from '$lib/server/services/eventDisplayService';
import { getTodayVerse } from '$lib/server/services/verseService';
import { computeWeeklyStreak } from '$lib/server/services/streakService';
import { toIsoTimestamp } from '$lib/server/db/actions/taskStats';
import { DateTime } from 'luxon';

type RosterMember = {
	userId: string;
	firstName: string;
	lastName: string;
	email: string | null;
	role: string | null;
	memberType: string | null;
};

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

/** Coerce a parsed-event time (string | Date | null) to an ISO string. */
function toIsoString(v: unknown): string | null {
	if (v instanceof Date) return v.toISOString();
	return v ? String(v) : null;
}

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	const userId = event.locals.user.id;
	const zone = await getUserZone(userId);
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

	const userSettings = await getUserSettings(userId);
	const familyId = await getUserFamilyId(userId);

	// Effective per-module visibility: family master switch AND this user's
	// own hidden list. Family-heavy fetches below are skipped when no family
	// module is visible, so hidden-low-priority families don't pay for them.
	const familySwitches = familyId ? await getFamilyModuleSwitches(familyId) : {};
	const modules = composeModuleVisibility(familySwitches, userSettings?.hiddenDashboardModules ?? []);
	const familyModulesVisible =
		modules.board || modules.memberStrip || modules.kids || modules.meals;

	// Overdue Recurring Tasks stick to today first (cursor v3), so "today"
	// surfaces the same pinned occurrences the calendar would.
	await syncRecurringCursors(userId, familyId, zone);

	const [userTasks, familyTasks] = await Promise.all([
		getTasksForUser(userId, familyId),
		familyId && familyModulesVisible ? getTasksForFamily(familyId) : Promise.resolve([])
	]);

	// The board shows only open tasks; completed ones vanish after toggle.
	const openFamilyTasks = familyTasks.filter((t) => !t.completedAt);

	// Events for the day, from the personal + (optional) family calendar.
	const { events: userEventsData } = await getUserDayCalendar(userId);
	let familyEventsData: CalendarEvent[] = [];
	if (familyId) {
		familyEventsData = await getFamilyDayEvents(familyId);
	}

	const [parsedUser, parsedFamily] = await Promise.all([
		parseEvents(await expandEventsForUser(userEventsData), zone),
		parseEvents(await expandEventsForUser(familyEventsData), zone)
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

	// Family roster + per-member status for the Member Strip, plus the
	// attendance join for the "in an event today" dot. Attendance rows are
	// keyed by the master event id, so the join uses masterId (occurrences
	// of a series share the master's attendance).
	let familyMembers: RosterMember[] = [];
	let memberStatus: {
		userId: string;
		firstName: string;
		lastName: string;
		openTasksToday: number;
		attendingToday: boolean;
	}[] = [];
	// Kids' Schedule: the viewed day's family events with a Child attendee
	// (memberType='child', RSVP not declined) — decision 7.
	let kidsSchedule: KidsScheduleEvent[] = [];
	if (familyId && familyModulesVisible) {
		familyMembers = await getFamilyRoster(familyId);
		const childMembers = familyMembers.filter((m) => m.memberType === 'child');
		const familyEventIds = dayEvents
			.filter((e) => e.source === 'family')
			.map((e) => e.masterId ?? e.id);
		const attendanceRows = familyEventIds.length
			? await getFamilyAttendanceForEvents(familyEventIds)
			: [];
		const attending = new Set(attendanceRows.map((a) => a.userId!).filter(Boolean));
		memberStatus = familyMembers.map((m) => {
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
			kidsSchedule = dayEvents
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
	}

	// Meals for the viewed day, keyed by the day's 'YYYY-MM-DD' label in the
	// viewer's zone (decision 12). Family module — hidden without a family.
	const dateKey = dayStart.toFormat('yyyy-MM-dd');
	let meals: Meal[] = [];
	if (familyId && modules.meals) {
		meals = await getMealsByDate(familyId, dateKey);
	}

	// Top-3 ranking: mine-first → priority → overdue → due-today → next,
	// bucketed relative to the viewed day (rankTop3 returns bare rows).
	const top3 = rankTop3(userTasks as RankableTask[], userId, { todayStartIso: dayStartIso }).map((t) => {
		const src = userTasks.find((u) => u.id === t.id);
		return {
			...t,
			assigneeFirstName: src?.assigneeFirstName,
			assigneeLastName: src?.assigneeLastName
		};
	});

	// Day-at-a-glance progress: done within the viewed day, open by end of it.
	const doneForDay = userTasks.filter(
		(t) => t.completedAt && new Date(t.completedAt) >= dayStart.toJSDate() && new Date(t.completedAt) < dayEnd.toJSDate()
	).length;
	const openForDay = userTasks.filter(
		(t) => !t.completedAt && t.dueDate && new Date(t.dueDate) < dayEnd.toJSDate()
	).length;

	const completionRows = await getCompletionTimestamps(userId);
	const streak = computeWeeklyStreak(
		completionRows.map((r) => toIsoTimestamp(r.completedAt)).filter(Boolean),
		now.toISO()!
	);

	const verseTranslation = userSettings?.verseTranslation ?? 'esv';
	const dailyVerse = userSettings?.showDailyVerse ? await getTodayVerse(verseTranslation) : null;

	return {
		zone,
		dayISO: dayStartIso,
		dateKey,
		isToday,
		meId: userId,
		userSettings,
		familyId,
		modules,
		userTasks,
		familyTasks: openFamilyTasks,
		familyMembers,
		memberStatus,
		dayEvents,
		top3,
		glance: { doneToday: doneForDay, openToday: openForDay, weekStreak: streak.current },
		dailyVerse,
		kidsSchedule,
		meals
	};
};