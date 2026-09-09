import { matchesTagFilter } from './familyTaskActions';

/** Roster + task shapes for the family task list model (#039). */

export interface ListMember {
	userId: string;
	firstName?: string | null;
	lastName?: string | null;
}

export interface ListTask {
	id: string;
	title: string;
	notes?: string | null;
	completedAt?: string | null;
	tags?: string[] | null;
	assignedTo?: string | null;
	assignmentStatus?: string | null;
	assigneeFirstName?: string | null;
	assigneeLastName?: string | null;
}

export function memberName(userId: string | null | undefined, members: ListMember[]): string {
	if (!userId) return 'Unassigned';
	const m = members.find((f) => f.userId === userId);
	if (m) return `${m.firstName} ${m.lastName}`.trim();
	return userId.slice(0, 8);
}

export function matchesSearch(t: ListTask, searchQuery: string, members: ListMember[]): boolean {
	const q = searchQuery.trim().toLowerCase();
	if (!q) return true;
	if (t.title.toLowerCase().includes(q)) return true;
	if ((t.notes ?? '').toLowerCase().includes(q)) return true;
	if ((t.tags ?? []).some((g) => g.toLowerCase().includes(q))) return true;
	if (t.assigneeFirstName || t.assigneeLastName) {
		if (`${t.assigneeFirstName} ${t.assigneeLastName}`.toLowerCase().includes(q)) return true;
	}
	if (t.assignedTo && memberName(t.assignedTo, members).toLowerCase().includes(q)) return true;
	return false;
}

export interface TaskFilters {
	tagFilter: string;
	searchQuery: string;
	members: ListMember[];
}

/** Split open/completed honoring the tag + search filters. */
export function filterTasks(
	tasks: ListTask[],
	filters: TaskFilters
) {
	const { tagFilter, searchQuery, members } = filters;
	return {
		open: tasks.filter(
			(t) =>
				!t.completedAt && matchesTagFilter(t, tagFilter) && matchesSearch(t, searchQuery, members)
		),
		completed: tasks.filter(
			(t) =>
				!!t.completedAt && matchesTagFilter(t, tagFilter) && matchesSearch(t, searchQuery, members)
		)
	};
}

export interface AssigneeGroup {
	member: ListMember;
	tasks: ListTask[];
}

/** Group sorted open tasks by assignee (viewer first); declined handoffs and
 * unknown assignees fall into the legacy unassigned bucket. */
export function groupByAssignee(
	sortedOpen: ListTask[],
	members: ListMember[],
	currentUserId: string | undefined
) {
	const byAssignee = members
		.map((m) => ({
			member: m,
			tasks: sortedOpen.filter(
				(t) => t.assignedTo === m.userId && t.assignmentStatus !== 'declined'
			)
		}))
		.filter((g) => g.tasks.length > 0)
		.sort((a, b) =>
			a.member.userId === currentUserId ? -1 : b.member.userId === currentUserId ? 1 : 0
		);
	const groupedIds = new Set(byAssignee.flatMap((g) => g.tasks.map((t) => t.id)));
	return { byAssignee, unassignedTasks: sortedOpen.filter((t) => !groupedIds.has(t.id)) };
}
