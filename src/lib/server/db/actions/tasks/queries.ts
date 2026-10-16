// Task visibility queries (issue #113): the shared FROM/JOIN shape for the
// task-scoping section views plus the user/family/event list readers
// (issue 019). Tags are attached afterwards via attachTags (issue 113).

import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '$lib/server/db';
import { events, familyMembers, tasks, users } from '$lib/server/db/schema';
import { logEvent } from '$lib/server/services/logger';
import { syncRecurringCursors } from './cursor';
import { attachTags, withTags } from './tags';
import type { TaskWithTags } from './types';

const assignee = alias(users, 'assignee');
const creator = alias(users, 'creator');

/** Personal tasks + family tasks + tasks attached to the given events,
 *  with the parent event's title/start so lists can attribute them.
 *  Runs the Recurring Task cursor pin (110) for its scope FIRST — the
 *  interface, not the caller, owns the sync-before-read order. */
export async function getTasksForUser(
	userId: string,
	familyId?: string | null,
	zone?: string
): Promise<TaskWithTags[]> {
	await syncRecurringCursors(userId, familyId ?? null, zone);
	const conditions = [eq(tasks.userId, userId)];
	if (familyId) {
		conditions.push(eq(tasks.familyId, familyId));
	}
	const rows = await db
		.select({
			id: tasks.id,
			title: tasks.title,
			notes: tasks.notes,
			dueDate: tasks.dueDate,
			completedAt: tasks.completedAt,
			archivedAt: tasks.archivedAt,
			recurrenceFrequency: tasks.recurrenceFrequency,
			recurrenceInterval: tasks.recurrenceInterval,
			completionCount: tasks.completionCount,
			assignedTo: tasks.assignedTo,
			assignmentStatus: tasks.assignmentStatus,
			priority: tasks.priority,
			visibility: tasks.visibility,
			assigneeFirstName: assignee.firstName,
			assigneeLastName: assignee.lastName,
			userId: tasks.userId,
			familyId: tasks.familyId,
			eventId: tasks.eventId,
			createdAt: tasks.createdAt,
			eventTitle: events.title,
			eventStart: events.start,
			// Already joined above (#069) — a Task inherits its Event's
			// calendar so the calendar filter can hide a Task with it.
			eventCalendarId: events.calendarId
		})
		.from(tasks)
		.leftJoin(events, eq(tasks.eventId, events.id))
		.leftJoin(assignee, eq(tasks.assignedTo, assignee.id))
		.where(and(or(...conditions), isNull(tasks.archivedAt)))
		.orderBy(desc(tasks.createdAt));
	const tagMap = await attachTags(rows);
	return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));
}

export async function getTasksForEvent(eventId: string) {
	return await db
		.select()
		.from(tasks)
		.where(and(eq(tasks.eventId, eventId), isNull(tasks.archivedAt)))
		.orderBy(tasks.createdAt);
}

/** Every task in a family, with assignee and creator attribution.
 *  Cursor pin (110) runs first, scoped to family rows (no user leg). */
export async function getTasksForFamily(familyId: string, zone?: string): Promise<TaskWithTags[]> {
	await syncRecurringCursors(null, familyId, zone);
	const rows = await db
		.select({
			id: tasks.id,
			title: tasks.title,
			notes: tasks.notes,
			dueDate: tasks.dueDate,
			completedAt: tasks.completedAt,
			archivedAt: tasks.archivedAt,
			recurrenceFrequency: tasks.recurrenceFrequency,
			recurrenceInterval: tasks.recurrenceInterval,
			completionCount: tasks.completionCount,
			assignedTo: tasks.assignedTo,
			assignmentStatus: tasks.assignmentStatus,
			priority: tasks.priority,
			visibility: tasks.visibility,
			assigneeFirstName: assignee.firstName,
			assigneeLastName: assignee.lastName,
			userId: tasks.userId,
			familyId: tasks.familyId,
			eventId: tasks.eventId,
			createdAt: tasks.createdAt,
			eventTitle: events.title,
			eventStart: events.start,
			creatorFirstName: creator.firstName
		})
		.from(tasks)
		.leftJoin(events, eq(tasks.eventId, events.id))
		.leftJoin(assignee, eq(tasks.assignedTo, assignee.id))
		.leftJoin(creator, eq(tasks.userId, creator.id))
		.where(and(eq(tasks.familyId, familyId), isNull(tasks.archivedAt)))
		.orderBy(desc(tasks.createdAt));
	const tagMap = await attachTags(rows);
	return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));
}

const sectionSelect = {
	id: tasks.id,
	title: tasks.title,
	notes: tasks.notes,
	dueDate: tasks.dueDate,
	completedAt: tasks.completedAt,
	archivedAt: tasks.archivedAt,
	recurrenceFrequency: tasks.recurrenceFrequency,
	recurrenceInterval: tasks.recurrenceInterval,
	completionCount: tasks.completionCount,
	assignedTo: tasks.assignedTo,
	assignmentStatus: tasks.assignmentStatus,
	priority: tasks.priority,
	visibility: tasks.visibility,
	assigneeFirstName: assignee.firstName,
	assigneeLastName: assignee.lastName,
	userId: tasks.userId,
	familyId: tasks.familyId,
	eventId: tasks.eventId,
	createdAt: tasks.createdAt,
	eventTitle: events.title,
	eventStart: events.start,
	creatorFirstName: creator.firstName
} as const;

/**
 * Shared FROM/JOIN shape for the task-scoping section queries (issue 019):
 * parent-event attribution plus assignee + creator names, tags attached
 * afterwards via attachTags like every other list query.
 */
// Not part of the public barrel: the assignment list reads reuse this shape.
export function sectionQuery() {
	return db
		.select(sectionSelect)
		.from(tasks)
		.leftJoin(events, eq(tasks.eventId, events.id))
		.leftJoin(assignee, eq(tasks.assignedTo, assignee.id))
		.leftJoin(creator, eq(tasks.userId, creator.id));
}

/**
 * MY TASKS list (issue 019): my personal tasks (familyId null, any
 * visibility) PLUS tasks assigned to me with an ACCEPTED status — an
 * accepted assignment becomes mine, wherever it lives. Pending rows stay
 * in getPendingAssignments; visibility is never a leak here because every
 * row is either owned by me or actively assigned to me.
 */
export async function getMyTasks(userId: string): Promise<TaskWithTags[]> {
	const rows = await sectionQuery()
		.where(
			and(
				or(
					and(isNull(tasks.familyId), eq(tasks.userId, userId)),
					and(eq(tasks.assignedTo, userId), eq(tasks.assignmentStatus, 'accepted'))
				),
				isNull(tasks.archivedAt)
			)
		)
		.orderBy(desc(tasks.createdAt));
	// Test-env trace (non-prod only): myTasks row mix per caller.
	if (process.env.NODE_ENV !== 'production')
		logEvent('debug', 'tasks_debug_getMyTasks', {
			userId,
			count: rows.length,
			personal: rows.filter((r) => !r.familyId).length,
			family: rows.filter((r) => !!r.familyId).length
		});
	return withTags(rows);
}

/**
 * FAMILY PAGE "Public tasks" tab (issue 019): personal tasks (familyId
 * null) marked public by a CURRENT member of the family. Private rows and
 * creators since removed are filtered out at the SQL level — visibility
 * filtering lives in the query, never in the caller.
 */
export async function getPublicTasksForFamily(
	familyId: string,
	zone?: string
): Promise<TaskWithTags[]> {
	// The public tab reads members' PERSONAL rows (familyId null), so its
	// sync adds the member-personal leg — otherwise this view would show
	// stale overdue recurring cursors no other sync covers (110).
	await syncRecurringCursors(null, familyId, zone, true);
	const rows = await db
		.select(sectionSelect)
		.from(tasks)
		.innerJoin(
			familyMembers,
			and(eq(familyMembers.userId, tasks.userId), eq(familyMembers.familyId, familyId))
		)
		.leftJoin(events, eq(tasks.eventId, events.id))
		.leftJoin(assignee, eq(tasks.assignedTo, assignee.id))
		.leftJoin(creator, eq(tasks.userId, creator.id))
		.where(and(isNull(tasks.familyId), eq(tasks.visibility, 'public'), isNull(tasks.archivedAt)))
		.orderBy(desc(tasks.createdAt));
	return withTags(rows);
}
