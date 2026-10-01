/**
 * The Family Task Board's grouping (issue 101, decision 1).
 *
 * CONTEXT.md defines the Family Task Board as "grouped by assignee (falling
 * back to the creator when a Task is unassigned)" — so `boardOwnerId` IS that
 * rule, in one place, shared by the dashboard card and the family tasks page.
 * Two surfaces with the same name must not grow two shapes.
 *
 * The fallback uses the Task's own creator rather than inventing an owner or
 * opening an "Unassigned" bucket; a family member with nothing assigned gets no
 * column at all, because an empty column is a heading about nothing.
 */
import { compareUrgency, type UrgencyTask } from './taskUrgency';

export interface AssigneeTask {
	id: string;
	assignedTo?: string | null;
	userId: string;
}

export interface BoardGroup<T extends AssigneeTask> {
	/** The assignee, or the creator when the Task is unassigned. */
	ownerId: string;
	name: string;
	tasks: T[];
}

/** The board's owner for a Task: its assignee, else the person who created it. */
export function boardOwnerId(task: AssigneeTask): string {
	return task.assignedTo ?? task.userId;
}

/**
 * Open Tasks, one column per person. Columns are ordered viewer-first then by
 * name; inside a column the order is urgency (overdue → today → up next, by
 * date) — the grouping is by person, the order within it is by date.
 */
export function groupTasksByAssignee<T extends AssigneeTask & UrgencyTask>(
	tasks: readonly T[],
	nameFor: (ownerId: string) => string,
	viewerId?: string | null
): BoardGroup<T>[] {
	const byOwner = new Map<string, T[]>();
	for (const t of tasks) {
		const ownerId = boardOwnerId(t);
		const column = byOwner.get(ownerId);
		if (column) column.push(t);
		else byOwner.set(ownerId, [t]);
	}
	return [...byOwner.entries()]
		.map(([ownerId, rows]) => ({
			ownerId,
			name: nameFor(ownerId),
			tasks: [...rows].sort(compareUrgency)
		}))
		.sort((a, b) => {
			if (a.ownerId === viewerId) return -1;
			if (b.ownerId === viewerId) return 1;
			return a.name.localeCompare(b.name) || a.ownerId.localeCompare(b.ownerId);
		});
}
