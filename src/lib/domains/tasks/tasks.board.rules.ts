/**
 * tasks board rules — the Family Task Board's grouping, the ONE home for both
 * surfaces that render the board: the Day Dashboard card and `/family/tasks`.
 *
 * Legacy home: `utils/familyTaskGroups.ts` (`boardOwnerId` +
 * `groupTasksByAssignee`). The one rule: a column belongs to a Task's assignee
 * or, when the Task is unassigned, to the person who created it — never to an
 * invented "Unassigned" bucket. Columns are viewer-first then by name (and id,
 * so two identical names stay stable); inside a column the order is urgency,
 * through the list's own comparator (`compareTaskUrgency`), never a second one.
 *
 * The two surfaces differ in one input: the Day Dashboard card draws a column
 * per roster member (an empty column there says "nothing assigned" beside the
 * other names), while the family board renders no empty column (it is a heading
 * about nothing). That is `rosterIds`, and it is the only difference.
 *
 * Pure: `now` and the name lookup are passed in (R5).
 *
 * Doc: ./README.md#invariants
 */
import { compareTaskUrgency } from './tasks.list.rules';

/** What a board row must carry to be grouped and ordered. */
export type FamilyBoardRow = {
	readonly id: string;
	readonly title: string;
	readonly dueDate: string | null;
	readonly completedAt: string | null;
	readonly assignedTo: string | null;
	readonly userId: string;
};

/** One board column: a person (or a removed member's id) and their rows. */
export type FamilyBoardColumn<T extends FamilyBoardRow = FamilyBoardRow> = {
	readonly ownerId: string;
	readonly name: string;
	readonly tasks: T[];
};

export type FamilyBoardGrouping = {
	/** Members to draw a column for even with nothing assigned (the dashboard card). */
	readonly rosterIds?: readonly string[];
	readonly viewerId: string;
	readonly nameFor: (ownerId: string) => string;
	readonly now: Date;
};

/** The column a Task belongs to: its assignee, else the person who created it. */
export function familyBoardOwnerId<T extends FamilyBoardRow>(task: T): string {
	return task.assignedTo ?? task.userId;
}

/**
 * Open Tasks, one column per person, viewer-first then by name; inside a column
 * the urgency order (overdue → today → up next → no due, then earliest due,
 * then title). A member who left the family keeps their column while their
 * Tasks are still open, because the column comes from the rows too.
 */
export function groupFamilyBoard<T extends FamilyBoardRow>(
	tasks: readonly T[],
	grouping: FamilyBoardGrouping
): FamilyBoardColumn<T>[] {
	const byOwner = new Map<string, T[]>();
	for (const task of tasks) {
		const ownerId = familyBoardOwnerId(task);
		const column = byOwner.get(ownerId);
		if (column) column.push(task);
		else byOwner.set(ownerId, [task]);
	}

	return [...new Set([...byOwner.keys(), ...(grouping.rosterIds ?? [])])]
		.map((ownerId) => ({
			ownerId,
			name: grouping.nameFor(ownerId),
			tasks: [...(byOwner.get(ownerId) ?? [])].sort((a, b) =>
				compareTaskUrgency(a, b, grouping.now)
			)
		}))
		.sort((a, b) => {
			if (a.ownerId === grouping.viewerId) return -1;
			if (b.ownerId === grouping.viewerId) return 1;
			return a.name.localeCompare(b.name) || a.ownerId.localeCompare(b.ownerId);
		});
}
