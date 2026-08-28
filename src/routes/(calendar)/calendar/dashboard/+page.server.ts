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
import { getUserZone, zonedNow } from '$lib/server/utils/userTimezone';
import { expandEventsForUser, parseEvents } from '$lib/server/services/eventDisplayService';
import { getTodayVerse } from '$lib/server/services/verseService';
import { computeWeeklyStreak } from '$lib/server/services/streakService';
import { toIsoTimestamp } from '$lib/server/db/actions/taskStats';

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
	const todayStart = now.startOf('day');
	const todayEnd = now.endOf('day');
	const todayStartIso = todayStart.toISO()!;

	const userSettings = await getUserSettings(userId);
	const familyId = await getUserFamilyId(userId);

	// Overdue Recurring Tasks stick to today first (cursor v3), so "today"
	// surfaces the same pinned occurrences the calendar would.
	await syncRecurringCursors(userId, familyId, zone);

	const [userTasks, familyTasks] = await Promise.all([
		getTasksForUser(userId, familyId),
		familyId ? getTasksForFamily(familyId) : Promise.resolve([])
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

	const userSettingsColor = userSettings?.color || '#fa8072';
	const dayEvents = [
		...parsedUser.map((e) => ({
			...e,
			color: userSettingsColor,
			source: 'own' as const
		})),
		...parsedFamily.map((e) => ({
			...e,
			color: '#e0ffff',
			source: 'family' as const
		}))
	].filter((e) => {
		const d = e.date instanceof Date ? e.date : new Date(e.date);
		return d >= todayStart.toJSDate() && d < todayEnd.toJSDate();
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
	if (familyId) {
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

	// Top-3 ranking: mine-first → priority → overdue → due-today → next.
	// Enrich with assignee names for the card (rankTop3 returns bare rows).
	const top3 = rankTop3(userTasks as RankableTask[], userId, { todayStartIso }).map((t) => {
		const src = userTasks.find((u) => u.id === t.id);
		return {
			...t,
			assigneeFirstName: src?.assigneeFirstName,
			assigneeLastName: src?.assigneeLastName
		};
	});

	// Today at a Glance progress: open (due today or overdue) vs done today.
	const doneToday = userTasks.filter(
		(t) => t.completedAt && new Date(t.completedAt) >= todayStart.toJSDate() && new Date(t.completedAt) < todayEnd.toJSDate()
	).length;
	const openToday = userTasks.filter(
		(t) => !t.completedAt && t.dueDate && new Date(t.dueDate) < todayEnd.toJSDate()
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
		todayISO: todayStartIso,
		meId: userId,
		userSettings,
		familyId,
		userTasks,
		familyTasks,
		familyMembers,
		memberStatus,
		dayEvents,
		top3,
		glance: { doneToday, openToday, weekStreak: streak.current },
		dailyVerse
	};
};