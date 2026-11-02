// Assignment / Requested–To-Accept state (issue #113): the two assignment
// list reads and the assignment authority rules (issue 019).

import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { familyMembers, taskTags, tasks, type Task } from '$lib/server/db/schema';
import { attachTags, normalizeTags, withTags } from './tags';
import { sectionQuery } from './queries';
import type { AssignmentPatch, TaskFieldPatch, TaskWithTags } from './types';


/**
 * ASSIGNMENTS "To accept" tab (issue 019): rows assigned to me that are
 * still pending — family or personal, any visibility (I was asked).
 */
export async function getPendingAssignments(userId: string): Promise<TaskWithTags[]> {
	const rows = await sectionQuery()
		.where(
			and(
				eq(tasks.assignedTo, userId),
				eq(tasks.assignmentStatus, 'pending'),
				isNull(tasks.archivedAt)
			)
		)
		.orderBy(desc(tasks.createdAt));
	return withTags(rows);
}

/**
 * ASSIGNMENTS "Requested" tab (issue 019): tasks I assigned OUT — my rows
 * with an assignee, in any status (the UI badges Pending/Accepted/Declined).
 */
export async function getRequestedByMe(userId: string): Promise<TaskWithTags[]> {
	const rows = await sectionQuery()
		.where(and(eq(tasks.userId, userId), isNotNull(tasks.assignedTo), isNull(tasks.archivedAt)))
		.orderBy(desc(tasks.createdAt));
	return withTags(rows);
}

/**
 * Assignment authority for a caller who does NOT own the task: the
 * current assignee may accept, or decline (release back to the pool),
 * their own assignment. Everything else assignment-shaped — reassign,
 * re-target, clear someone else's assignment — stays owner-only and
 * comes back as null (the caller turns that into a 403). An empty
 * patch (tags-only edit) passes through untouched.
 */
export function nonOwnerAssignmentPatch(
	task: Pick<Task, 'assignedTo'>,
	callerId: string,
	patch: AssignmentPatch
): AssignmentPatch | null {
	if (Object.keys(patch).length === 0) return {};
	if (task.assignedTo !== callerId) return null;
	if (patch.assignedTo === undefined && patch.assignmentStatus === 'accepted') {
		return { assignmentStatus: 'accepted' };
	}
	if (patch.assignedTo === null && patch.assignmentStatus === 'none') {
		return { assignedTo: null, assignmentStatus: 'none' };
	}
	return null;
}

/**
 * Assignment target check: a task may be assigned to the creator
 * themself, or to an existing member of the target family. Anything
 * else would strand the task as a pending row its assignee can never
 * see. Self-assignment needs no lookup; otherwise the familyMembers
 * row is the single membership seam.
 */
export async function isValidAssignee(
	callerId: string,
	familyId: string | null,
	assignedTo: string
): Promise<boolean> {
	if (assignedTo === callerId) return true;
	if (!familyId) return false;
	const [member] = await db
		.select({ familyId: familyMembers.familyId })
		.from(familyMembers)
		.where(and(eq(familyMembers.userId, assignedTo), eq(familyMembers.familyId, familyId)));
	return Boolean(member);
}

/**
 * Collaborator write (#232): a caller the route already cleared through
 * canMutateTask — a family member, or a live assignee — edits the task's
 * plain fields, tags, and (pre-scoped by nonOwnerAssignmentPatch) their
 * own assignment response. Scoped by the STORED familyId so a moved row
 * misses; `null` scopes to personal rows (live-assignee case). Visibility
 * is owner-only and never written here.
 */
export async function updateTaskInFamily(
	id: string,
	familyId: string | null,
	data: Omit<TaskFieldPatch, 'visibility'>
): Promise<TaskWithTags | undefined> {
	const hasTags = data.tags !== undefined;
	const patch = Object.fromEntries(
		Object.entries(data).filter(
			([k, v]) => k !== 'tags' && k !== 'visibility' && v !== undefined
		)
	);
	const scope = and(
		eq(tasks.id, id),
		familyId === null ? isNull(tasks.familyId) : eq(tasks.familyId, familyId)
	);
	if (Object.keys(patch).length === 0 && !hasTags) return undefined;
	return db.transaction(async (tx) => {
		let row: Task | undefined;
		if (Object.keys(patch).length > 0) {
			const [updated] = await tx
				.update(tasks)
				.set(patch)
				.where(scope)
				.returning();
			row = updated;
		} else {
			const [existing] = await tx.select().from(tasks).where(scope);
			row = existing;
		}
		if (!row) return undefined;
		const tags = normalizeTags(hasTags ? data.tags : ((await attachTags([row])).get(row.id) ?? []));
		if (hasTags) {
			await tx.delete(taskTags).where(eq(taskTags.taskId, row.id));
			if (tags.length > 0) {
				await tx.insert(taskTags).values(tags.map((name) => ({ taskId: row.id, name })));
			}
		}
		return { ...row, tags };
	});
}
