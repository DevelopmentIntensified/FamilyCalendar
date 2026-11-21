/**
 * tasks task rules: the visibility vocabulary and normalizer, the priority
 * normalizer, the tag normalizer and the two permission rules (who may mutate
 * a Task, and what a non-owner may do to its assignment).
 *
 * Nothing here reads the clock, the environment or the database: the stored
 * row and the viewer's family membership arrive as arguments (rule R5/R4).
 * Membership is a flag rather than a lookup because family owns
 * `familyMembers`; the service asks family once and passes the answer in.
 *
 * A Task's priority is the SAME concept as parsing's `QuickAddPriority`
 * (`'high' | 'normal' | 'low'`). The union is spelled out in the return type
 * instead of importing parsing for a type — the values are identical, so the
 * structural type matches parsing's when its port lands.
 *
 * Doc: ./README.md#invariants
 */

/** The two Task visibilities, in the order the wire checks them. */
export const TASK_VISIBILITIES = ['public', 'private'] as const;

export type TaskVisibility = (typeof TASK_VISIBILITIES)[number];

/** True when `value` is one of the supported visibilities. Case-sensitive. */
export function isTaskVisibility(value: unknown): value is TaskVisibility {
	return typeof value === 'string' && TASK_VISIBILITIES.some((candidate) => candidate === value);
}

/**
 * The stored visibility of a Task: an absent or unknown value reads as
 * `public` (legacy `tasks/types.ts` — the column default and the POST
 * default). The boundary rejects an explicit unknown value instead.
 */
export function normalizeTaskVisibility(value: unknown): TaskVisibility {
	return isTaskVisibility(value) ? value : 'public';
}

/**
 * The stored priority of a Task: `low | normal | high`, anything else
 * (including an absent value) becoming `normal` (legacy
 * `taskPriority.normalizeTaskPriority`; PUT and POST both fall back).
 */
export function normalizeTaskPriority(value: unknown): 'high' | 'normal' | 'low' {
	return value === 'high' || value === 'low' ? value : 'normal';
}

/**
 * Normalize raw tag input: lowercase, trim, drop empties, dedupe, sort.
 * Non-array input has no tags, and a non-string element is skipped, exactly
 * like legacy `normalizeTags` (`tags.ts:15-26`).
 */
export function normalizeTags(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const tag of raw) {
		if (typeof tag !== 'string') continue;
		const name = tag.trim().toLowerCase();
		if (!name || seen.has(name)) continue;
		seen.add(name);
		out.push(name);
	}
	return out.sort();
}

/** The stored fields the mutation rule reads. */
export type TaskMutabilityRow = {
	readonly userId: string;
	readonly familyId: string | null;
	readonly assignedTo: string | null;
	readonly assignmentStatus: string | null;
};

/**
 * Who may mutate a Task (legacy `auth.canMutateTask`):
 *
 * - the owner always;
 * - a PERSONAL Task (`familyId` null) only by its current assignee while the
 *   assignment is live (`pending`/`accepted`) — a family member gets nothing
 *   on a public personal Task (public is read-only visibility, not write);
 * - a FAMILY Task by its assignee or any member of its family.
 *
 * `role`/`memberType` are never consulted (ADR-0001), so the only DB-backed
 * leg is membership, passed in as `viewerIsFamilyMember`.
 */
export function canMutateTask(
	task: TaskMutabilityRow,
	viewerId: string,
	viewerIsFamilyMember: boolean
): boolean {
	if (task.userId === viewerId) return true;
	if (!task.familyId) {
		const status = task.assignmentStatus ?? '';
		return task.assignedTo === viewerId && (status === 'pending' || status === 'accepted');
	}
	if (task.assignedTo === viewerId) return true;
	return viewerIsFamilyMember;
}

/** The assignment columns a request may patch. */
export type TaskAssignmentPatch = {
	readonly assignedTo?: string | null;
	readonly assignmentStatus?: string;
};

/**
 * What a non-owner collaborator may do to a Task's assignment (legacy
 * `assignment.nonOwnerAssignmentPatch`): nothing at all when the patch carries
 * no assignment fields (a tags-only edit passes through untouched); the
 * current assignee may accept; releasing the row (`assignedTo: null` +
 * `none`, which is how a decline is rewritten) is allowed for them too;
 * anything else — reassigning, re-targeting, clearing someone else's
 * assignment — comes back as `null`, which the caller turns into a 403.
 */
export function nextAssignmentPatch(
	task: Pick<TaskMutabilityRow, 'assignedTo'>,
	callerId: string,
	patch: TaskAssignmentPatch
): TaskAssignmentPatch | null {
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
