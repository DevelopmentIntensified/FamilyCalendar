/**
 * Dashboard selectors — pure functions over task rows (no DB access) plus the
 * Day Dashboard's data-retrieval functions (which DO hit the db). The pure
 * ranking rules live apart from the tasks actions so they are unit-testable;
 * the db functions are thin, named retrievals so the route composes instead of
 * embedding raw queries.
 */

import { db } from '$lib/server/db';
import {
	calendars,
	events,
	eventAttendance,
	taskCompletions,
	tasks,
	type CalendarEvent
} from '$lib/server/db/schema';
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, ne } from 'drizzle-orm';
import {
	PRIORITY_WEIGHT,
	type TaskPriority
} from '$lib/server/db/actions/taskPriority';
import { toIsoTimestamp } from '$lib/server/db/actions/taskStats';

/** Re-exported for pre-existing importers (task writers, sort utils). */
export {
	TASK_PRIORITIES,
	DEFAULT_TASK_PRIORITY,
	PRIORITY_WEIGHT,
	isTaskPriority,
	normalizeTaskPriority,
	type TaskPriority
} from '$lib/server/db/actions/taskPriority';

/** A structural subset of a Task row — anything with these fields ranks. */
export interface RankableTask {
	id: string;
	title: string;
	dueDate: string | null;
	completedAt: string | null;
	priority: string;
	userId: string;
	assignedTo: string | null;
	assignmentStatus: string | null;
	archivedAt?: string | null;
}

export interface RankOpts {
	/** Start of the viewer's current day (user-timezone boundary), as ISO. Defaults to now (then UTC-based today). */
	todayStartIso?: string;
	/** Max tasks to return. Default 3. */
	limit?: number;
}

/**
 * Order the open task pool for the "Top-3 Priorities" card.
 *
 * First, the viewer's own tasks (assigned to them, or unassigned and created
 * by them); then priority high → normal → low; then urgency bucket
 * overdue → due-today → next-due → no-due; then earliest due date; then title.
 */
export function rankTop3(tasks: RankableTask[], viewerId: string, opts: RankOpts = {}): RankableTask[] {
	const { limit = 3 } = opts;
	const todayStart = Date.parse(opts.todayStartIso ?? new Date().toISOString());
	const tomorrow = todayStart + 86_400_000;

	const eligible = tasks.filter((t) => !t.completedAt && !t.archivedAt);

	const scored = eligible.map((t) => {
		const priority = PRIORITY_WEIGHT[t.priority as TaskPriority] ?? PRIORITY_WEIGHT.normal;
		const due = t.dueDate ? Date.parse(t.dueDate) : null;
		let bucket: number;
		if (due == null) bucket = 3; // no due
		else if (due < todayStart) bucket = 0; // overdue
		else if (due < tomorrow) bucket = 1; // due today
		else bucket = 2; // next
		const mine = t.userId === viewerId || t.assignedTo === viewerId;
		return { t, priority, due, bucket, mine };
	});

	scored.sort((a, b) => {
		if (a.mine !== b.mine) return a.mine ? -1 : 1;
		if (a.priority !== b.priority) return a.priority - b.priority;
		if (a.bucket !== b.bucket) return a.bucket - b.bucket;
		const aDue = a.due ?? Number.MAX_SAFE_INTEGER;
		const bDue = b.due ?? Number.MAX_SAFE_INTEGER;
		if (aDue !== bDue) return aDue - bDue;
		return a.t.title.localeCompare(b.t.title);
	});

	return scored.slice(0, limit).map((s) => s.t);
}

/**
 * The viewer's own Personal Calendar plus its events, for the Day Dashboard.
 * Returns `null` when the user has no personal calendar (then no events).
 */
export async function getUserDayCalendar(userId: string): Promise<{
	calendar: typeof calendars.$inferSelect | null;
	events: CalendarEvent[];
}> {
	const [userCal] = await db
		.select()
		.from(calendars)
		.where(and(eq(calendars.ownerId, userId), isNull(calendars.familyId)));
	if (!userCal) return { calendar: null, events: [] };
	const userEvents = await db.select().from(events).where(eq(events.calendarId, userCal.id));
	return { calendar: userCal, events: userEvents };
}

/**
 * Family events for the Day Dashboard — always shown day list, so this is
 * fetched whenever a family exists regardless of Dashboard Module visibility.
 */
export async function getFamilyDayEvents(familyId: string): Promise<CalendarEvent[]> {
	const [familyCal] = await db.select().from(calendars).where(eq(calendars.familyId, familyId));
	if (!familyCal) return [];
	return await db.select().from(events).where(eq(events.calendarId, familyCal.id));
}

/**
 * The set of family-member userIds "attending today": attendance rows for the
 * given family event ids whose user is set and hasn't declined.
 */
export async function getFamilyAttendanceForEvents(
	familyEventIds: string[]
): Promise<{ userId: string | null }[]> {
	return await db
		.select({ userId: eventAttendance.userId })
		.from(eventAttendance)
		.where(
			and(
				inArray(eventAttendance.eventId, familyEventIds),
				isNotNull(eventAttendance.userId),
				ne(eventAttendance.status, 'declined')
			)
		);
}

/**
 * Kids' Schedule attendance rows: family event attendees who are children
 * (memberType='child') and haven't declined, keyed by event + user.
 */
export async function getKidsScheduleAttendance(
	familyEventIds: string[],
	childIds: string[]
): Promise<{ eventId: string; userId: string | null }[]> {
	return await db
		.select({
			eventId: eventAttendance.eventId,
			userId: eventAttendance.userId
		})
		.from(eventAttendance)
		.where(
			and(
				inArray(eventAttendance.eventId, familyEventIds),
				inArray(eventAttendance.userId, childIds),
				ne(eventAttendance.status, 'declined')
			)
		);
}

/**
 * Completion timestamps for the viewer's streak, most-recent first (capped at
 * the year the Day Dashboard streak window needs).
 */
export async function getCompletionTimestamps(
	userId: string
): Promise<{ completedAt: string }[]> {
	return await db
		.select({ completedAt: taskCompletions.completedAt })
		.from(taskCompletions)
		.where(eq(taskCompletions.userId, userId))
		.orderBy(desc(taskCompletions.completedAt))
		.limit(365);
}

/** One row on the "Completed today" card. */
export interface DayCompletion {
	id: string;
	title: string;
	completedAt: string | null;
}

type RecurringDayCompletionRow = {
	id: string;
	title: string;
	completedAt: string;
};

/**
 * Recurring-task check-offs for the viewer within a day window, newest first.
 * A recurring check-off rolls the cursor forward and never sets the row's
 * `completedAt`, so the tasks-table filter can't see it — the append-only
 * `taskCompletions` history can. One entry per check-off (each one is a win).
 */
export async function getRecurringDayCompletions(
	userId: string,
	dayStart: Date,
	dayEnd: Date
): Promise<RecurringDayCompletionRow[]> {
	// String-mode timestamptz column: postgres.js serializes bound values as
	// strings and rejects Date instances, so bind ISO strings.
	const startIso = dayStart.toISOString();
	const endIso = dayEnd.toISOString();
	const rows = await db
		.select({
			id: taskCompletions.id,
			title: tasks.title,
			completedAt: taskCompletions.completedAt
		})
		.from(taskCompletions)
		.innerJoin(tasks, eq(taskCompletions.taskId, tasks.id))
		.where(
			and(
				eq(taskCompletions.userId, userId),
				isNotNull(tasks.recurrenceFrequency),
				gte(taskCompletions.completedAt, startIso),
				lt(taskCompletions.completedAt, endIso)
			)
		)
		.orderBy(desc(taskCompletions.completedAt));
	return rows.map((r) => ({ id: r.id, title: r.title, completedAt: toIsoTimestamp(r.completedAt) }));
}

/**
 * Combine the day's completed rows — one-off tasks that are currently
 * completed plus recurring check-offs from history — newest first.
 */
export function mergeDayCompletions(
	oneOff: DayCompletion[],
	recurring: DayCompletion[]
): DayCompletion[] {
	return [...oneOff, ...recurring].sort((a, b) => {
		const ta = a.completedAt ? Date.parse(a.completedAt) : 0;
		const tb = b.completedAt ? Date.parse(b.completedAt) : 0;
		return tb - ta;
	});
}