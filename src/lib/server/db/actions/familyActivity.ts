import { db } from '$lib/server/db';
import { tasks, users } from '$lib/server/db/schema';
import { alias } from 'drizzle-orm/pg-core';
import { and, desc, eq, isNotNull, ne } from 'drizzle-orm';

const assignee = alias(users, 'assignee');
const creator = alias(users, 'creator');

export type FamilyActivityItem = {
	kind: 'completed' | 'assigned';
	title: string;
	actorName: string;
	targetName: string | null;
	at: string;
};

function fullName(first: string | null, last: string | null): string {
	return [first, last].filter(Boolean).join(' ');
}

function toIso(value: string | Date): string {
	return typeof value === 'string' ? value : value.toISOString();
}

export async function getRecentFamilyActivity(
	familyId: string,
	limit = 8
): Promise<FamilyActivityItem[]> {
	const completedRows = await db
		.select({
			title: tasks.title,
			completedAt: tasks.completedAt,
			assigneeFirst: assignee.firstName,
			assigneeLast: assignee.lastName,
			creatorFirst: creator.firstName,
			creatorLast: creator.lastName
		})
		.from(tasks)
		.leftJoin(assignee, eq(tasks.assignedTo, assignee.id))
		.innerJoin(creator, eq(tasks.userId, creator.id))
		.where(and(eq(tasks.familyId, familyId), isNotNull(tasks.completedAt)))
		.orderBy(desc(tasks.completedAt))
		.limit(limit);

	const assignedRows = await db
		.select({
			title: tasks.title,
			createdAt: tasks.createdAt,
			creatorFirst: creator.firstName,
			creatorLast: creator.lastName,
			assigneeFirst: assignee.firstName,
			assigneeLast: assignee.lastName
		})
		.from(tasks)
		.innerJoin(assignee, eq(tasks.assignedTo, assignee.id))
		.innerJoin(creator, eq(tasks.userId, creator.id))
		.where(
			and(
				eq(tasks.familyId, familyId),
				eq(tasks.assignmentStatus, 'accepted'),
				isNotNull(tasks.assignedTo),
				ne(tasks.assignedTo, tasks.userId)
			)
		)
		.orderBy(desc(tasks.createdAt))
		.limit(limit);

	const items: FamilyActivityItem[] = [
		...completedRows.map((r) => ({
			kind: 'completed' as const,
			title: r.title,
			actorName:
				fullName(r.assigneeFirst, r.assigneeLast) || fullName(r.creatorFirst, r.creatorLast),
			targetName: null,
			at: toIso(r.completedAt as string)
		})),
		...assignedRows.map((r) => ({
			kind: 'assigned' as const,
			title: r.title,
			actorName: fullName(r.creatorFirst, r.creatorLast),
			targetName: fullName(r.assigneeFirst, r.assigneeLast),
			at: toIso(r.createdAt)
		}))
	]
		.sort((a, b) => (a.at < b.at ? 1 : -1))
		.slice(0, limit);

	return items;
}
