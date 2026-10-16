// Authorization predicates (issue #113): the single family-membership seam
// and the issue-019 mutation permission rules.

import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { familyMembers, type Task } from '$lib/server/db/schema';


/**
 * Single family-membership seam: existence of a familyMembers row grants
 * family-scoped rights. `role` is permission-only per ADR-0001 and is never
 * consulted here; `memberType` is profile-only and likewise ignored.
 */
export async function isFamilyMember(userId: string, familyId: string): Promise<boolean> {
	const [member] = await db
		.select({ familyId: familyMembers.familyId })
		.from(familyMembers)
		.where(and(eq(familyMembers.userId, userId), eq(familyMembers.familyId, familyId)));
	return Boolean(member);
}

/**
 * Permission predicate for mutating a task (issue 019 rules):
 *
 * - Personal task (familyId null): the owner, or the CURRENT assignee
 *   while their assignment is pending/accepted. Nobody else — not even a
 *   family member on a PUBLIC personal task; public is read-only
 *   visibility, not write access. Visibility is filtered in the queries,
 *   so no non-owner/private leak can reach here either.
 * - Family task: unchanged — the owner, the assignee, or any member of
 *   the task's family. Family membership is the only DB-backed leg, so
 *   the lookup runs only when the cheaper owned/assigned checks fail.
 */
export async function canMutateTask(task: Task, userId: string): Promise<boolean> {
	const owned = task.userId === userId;
	if (owned) return true;
	if (!task.familyId) {
		// Personal task: only a live (pending/accepted) assignment grants
		// write; a stale assignedTo (declined leftovers) grants nothing.
		const status = task.assignmentStatus ?? '';
		return task.assignedTo === userId && (status === 'pending' || status === 'accepted');
	}
	const assigned = task.assignedTo === userId;
	if (assigned) return true;
	return isFamilyMember(userId, task.familyId);
}
