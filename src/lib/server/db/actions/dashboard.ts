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
	type CalendarEvent
} from '$lib/server/db/schema';
import { and, desc, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm';

export type TaskPriority = 'low' | 'normal' | 'high';
export const TASK_PRIORITIES = ['low', 'normal', 'high'] as const;
export const PRIORITY_WEIGHT: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

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