import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { calendars, events, taskCompletions, eventAttendance, type CalendarEvent } from '$lib/server/db/schema';
import { and, desc, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import { getUserSettings } from '$lib/server/db/actions/userSettings';
import { getFamilyRoster, getUserFamilyId } from '$lib/server/db/actions/families';
import {
	getTasksForUser,
	getTasksForFamily,
	syncRecurringCursors
} from '$lib/server/db/actions/tasks';
import { rankTop3, type RankableTask } from '$lib/server/db/actions/dashboard';
import {
	getFamilyModuleSwitches,
	composeModuleVisibility
} from '$lib/server/db/actions/dashboardModules';
import { getUserZone, zonedNow } from '$lib/server/utils/userTimezone';
import { expandEventsForUser, parseEvents, attachRsvpStatus } from '$lib/server/services/eventDisplayService';
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
};

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
	const familyModulesVisible = modules.board || modules.memberStrip;

	// Overdue Recurring Tasks stick to today first (cursor v3), so "today"
	// surfaces the same pinned occurrences the calendar would.
	await syncRecurringCursors(userId, familyId, zone);

	const [userTasks, familyTasks] = await Promise.all([
		getTasksForUser(userId, familyId),
		familyId && familyModulesVisible ? getTasksForFamily(familyId) : Promise.resolve([])
	]);

	// Events for the day, from the personal + (optional) family calendar.
	const [userCal] = await db
		.select()
		.from(calendars)
		.where(and(eq(calendars.ownerId, userId), isNull(calendars.familyId)));
	const userEventsData = userCal
		? await db.select().from(events).where(eq(events.calendarId, userCal.id))
		: [];
	let familyEventsData: CalendarEvent[] = [];
	if (familyId) {
		const [familyCal] = await db.select().from(calendars).where(eq(calendars.familyId, familyId));
		if (familyCal) {
			familyEventsData = await db.select().from(events).where(eq(events.calendarId, familyCal.id));
		}
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
	const dayEvents = [
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

	// Family roster + per-member status for the Member Strip, plus the
	// attendance join for the "in an event today" dot.
	let familyMembers: RosterMember[] = [];
	let memberStatus: {
		userId: string;
		firstName: string;
		lastName: string;
		openTasksToday: number;
		attendingToday: boolean;
	}[] = [];
	if (familyId && familyModulesVisible) {
		familyMembers = await getFamilyRoster(familyId);
		const familyEventIds = dayEvents.filter((e) => e.source === 'family').map((e) => e.id);
		const attendanceRows = familyEventIds.length
			? await db
					.select({ userId: eventAttendance.userId })
					.from(eventAttendance)
					.where(
						and(
							inArray(eventAttendance.eventId, familyEventIds),
							isNotNull(eventAttendance.userId),
							ne(eventAttendance.status, 'declined')
						)
					)
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

	const completionRows = await db
		.select({ completedAt: taskCompletions.completedAt })
		.from(taskCompletions)
		.where(eq(taskCompletions.userId, userId))
		.orderBy(desc(taskCompletions.completedAt))
		.limit(365);
	const streak = computeWeeklyStreak(
		completionRows.map((r) => toIsoTimestamp(r.completedAt)).filter(Boolean),
		now.toISO()!
	);

	const verseTranslation = userSettings?.verseTranslation ?? 'esv';
	const dailyVerse = userSettings?.showDailyVerse ? await getTodayVerse(verseTranslation) : null;

	return {
		zone,
		dayISO: dayStartIso,
		isToday,
		meId: userId,
		userSettings,
		familyId,
		modules,
		userTasks,
		familyTasks,
		familyMembers,
		memberStatus,
		dayEvents,
		top3,
		glance: { doneToday: doneForDay, openToday: openForDay, weekStreak: streak.current },
		dailyVerse
	};
};