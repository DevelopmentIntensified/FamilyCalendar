/**
 * tasks list rules — the whole of "what is urgent", the chip/search/tag
 * filters, the owner axis and the flat comparator the `/calendar/tasks` list
 * reads. Pure: `now` is passed in (R5), never read here.
 *
 * Legacy homes, one definition each: `utils/taskUrgency.ts` (buckets, late
 * chip, flat comparator, jump-bar labels), `utils/taskSort.ts` (the non-urgency
 * keys), `utils/taskRecurrence.ts` (the one-off/recurring split) and the page's
 * own `matchesChip`/`matchesSearch`/`matchesTagFilter`. Every legacy file is
 * deleted: this file is the one home.
 */

import { systemClock } from '$lib/kernel/time/clock';
import type { TaskPageRow, TaskWire, TaskWithTagsWire } from './tasks.contract';

/** Scope chips (issue 019). `family` = Family Tasks assigned to the viewer. */
export type TaskChip = 'all' | 'public' | 'private' | 'family';

export const TASK_CHIPS: readonly { readonly value: TaskChip; readonly label: string }[] = [
	{ value: 'all', label: 'Every scope' },
	{ value: 'public', label: 'Public' },
	{ value: 'private', label: 'Private' },
	{ value: 'family', label: 'Family' }
];

/**
 * The approved owner axis (`tasks.html`): `Mine` filters what was handed to me,
 * `Created by me` filters `userId` = me — the honest name for the prototype's
 * mislabelled fourth column. `Open` narrows nothing.
 */
export type TaskOwnerView = 'open' | 'mine' | 'created' | 'done';

export const TASK_OWNER_VIEWS: readonly {
	readonly value: TaskOwnerView;
	readonly label: string;
}[] = [
	{ value: 'open', label: 'Open' },
	{ value: 'mine', label: 'Mine' },
	{ value: 'created', label: 'Created by me' },
	{ value: 'done', label: 'Done' }
];

/** The sort menu's keys, in the order it prints them. */
export type TaskSortKey = 'urgency' | 'due' | 'priority' | 'created' | 'title';

export const TASK_SORT_KEYS: readonly { readonly value: TaskSortKey; readonly label: string }[] = [
	{ value: 'urgency', label: 'Urgency' },
	{ value: 'due', label: 'Due date' },
	{ value: 'priority', label: 'Priority' },
	{ value: 'created', label: 'Created' },
	{ value: 'title', label: 'Title A–Z' }
];

/** Where a Task sits in time; a finished Task is `done` whatever its date. */
export type TaskUrgencyBucket = 'overdue' | 'today' | 'upnext' | 'done';

/** The jump bar's filter state: `all`, or one bucket. */
export type TaskTimeFilter = 'all' | TaskUrgencyBucket;

export const TASK_TIME_FILTERS: readonly {
	readonly value: TaskTimeFilter;
	readonly label: string;
}[] = [
	{ value: 'all', label: 'All' },
	{ value: 'overdue', label: 'Overdue' },
	{ value: 'today', label: 'Today' },
	{ value: 'upnext', label: 'Up next' },
	{ value: 'done', label: 'Done' }
];

const BUCKET_RANK: Readonly<Record<TaskUrgencyBucket, number>> = {
	overdue: 0,
	today: 1,
	upnext: 2,
	done: 3
};

const PRIORITY_ORDER: Readonly<Record<'high' | 'normal' | 'low', number>> = {
	high: 0,
	normal: 1,
	low: 2
};

const DAY_MS = 86_400_000;

function timeOf(value: string | Date | null | undefined): number {
	if (!value) return Number.NaN;
	return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/** Local start of the day `now` falls on (the bucket boundary legacy used). */
function startOfLocalDay(now: Date): Date {
	const start = new Date(now.getTime());
	start.setHours(0, 0, 0, 0);
	return start;
}

function endOfLocalDay(now: Date): number {
	const end = new Date(now.getTime());
	end.setHours(23, 59, 59, 999);
	return end.getTime();
}

/** True when a due instant is before today's start. */
export function isTaskOverdue(due: string | Date | null | undefined, now: Date = systemClock.now()): boolean {
	const at = timeOf(due);
	return Number.isNaN(at) ? false : at < startOfLocalDay(now).getTime();
}

/** True when a due instant falls on `now`'s local day. */
export function isTaskDueToday(
	due: string | Date | null | undefined,
	now: Date = systemClock.now()
): boolean {
	const at = timeOf(due);
	if (Number.isNaN(at)) return false;
	return at >= startOfLocalDay(now).getTime() && at <= endOfLocalDay(now);
}

/**
 * The fields the urgency order reads. Narrow on purpose: the board's rows
 * (`tasks.board.rules.ts`) carry no notes, tags or priority, and they still
 * sort through this one comparator.
 */
export type TaskUrgencyRow = {
	readonly title: string;
	readonly dueDate: string | null;
	readonly completedAt: string | null;
};

export function taskUrgencyBucket(task: TaskUrgencyRow, now: Date = systemClock.now()): TaskUrgencyBucket {
	if (task.completedAt) return 'done';
	if (isTaskOverdue(task.dueDate, now)) return 'overdue';
	if (isTaskDueToday(task.dueDate, now)) return 'today';
	return 'upnext';
}

/** Whole days between today and a past due date; 0 when not overdue. */
export function taskLateDays(due: string | Date | null | undefined, now: Date = systemClock.now()): number {
	if (!isTaskOverdue(due, now)) return 0;
	const date = new Date(timeOf(due));
	date.setHours(0, 0, 0, 0);
	return Math.max(1, Math.round((startOfLocalDay(now).getTime() - date.getTime()) / DAY_MS));
}

/** The row's own overdue chip: "1 day late" / "N days late", or null. */
export function taskLateChip(
	due: string | Date | null | undefined,
	now: Date = systemClock.now()
): string | null {
	const days = taskLateDays(due, now);
	if (days === 0) return null;
	return `${days} ${days === 1 ? 'day' : 'days'} late`;
}

/** The two order keys the urgency comparator uses; a page row satisfies it. */
function dueTime(task: TaskUrgencyRow): number {
	const at = timeOf(task.dueDate);
	return Number.isNaN(at) ? Number.POSITIVE_INFINITY : at;
}

function titleOrder(a: TaskUrgencyRow, b: TaskUrgencyRow): number {
	return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
}

function priorityRank(priority: string | null | undefined): number {
	if (priority === 'high') return PRIORITY_ORDER.high;
	if (priority === 'low') return PRIORITY_ORDER.low;
	return PRIORITY_ORDER.normal;
}

/** overdue → today → up next → done, then by due date (undated last), then title. */
export function compareTaskUrgency(a: TaskUrgencyRow, b: TaskUrgencyRow, now: Date = systemClock.now()): number {
	const rankA = BUCKET_RANK[taskUrgencyBucket(a, now)];
	const rankB = BUCKET_RANK[taskUrgencyBucket(b, now)];
	if (rankA !== rankB) return rankA - rankB;
	return dueTime(a) - dueTime(b) || titleOrder(a, b);
}

/**
 * The flat list's comparator: a finished Task always sorts after every open
 * one, whatever the key says; every other key is an absolute override, then the
 * title breaks ties.
 */
export function sortTaskRows(
	a: TaskPageRow,
	b: TaskPageRow,
	key: TaskSortKey,
	now: Date = systemClock.now()
): number {
	const doneA = a.completedAt ? 1 : 0;
	const doneB = b.completedAt ? 1 : 0;
	if (doneA !== doneB) return doneA - doneB;
	if (key === 'urgency') return compareTaskUrgency(a, b, now);
	if (key === 'priority') {
		return priorityRank(a.priority) - priorityRank(b.priority) || titleOrder(a, b);
	}
	if (key === 'title') return titleOrder(a, b);
	if (key === 'created') {
		return (timeOf(b.createdAt) || 0) - (timeOf(a.createdAt) || 0) || titleOrder(a, b);
	}
	const nowMs = now.getTime();
	const overdueA = !!a.dueDate && timeOf(a.dueDate) < nowMs;
	const overdueB = !!b.dueDate && timeOf(b.dueDate) < nowMs;
	if (overdueA !== overdueB) return overdueA ? -1 : 1;
	return dueTime(a) - dueTime(b) || titleOrder(a, b);
}

/** What the jump bar prints: how many Tasks sit in each bucket. */
export function taskBucketCounts(
	tasks: readonly TaskPageRow[],
	now: Date = systemClock.now()
): Record<TaskUrgencyBucket, number> {
	const counts: Record<TaskUrgencyBucket, number> = { overdue: 0, today: 0, upnext: 0, done: 0 };
	for (const task of tasks) counts[taskUrgencyBucket(task, now)] += 1;
	return counts;
}

/** Completions inside the last seven days — the list's "completed this week" line. */
export function countTasksCompletedThisWeek(
	tasks: readonly TaskPageRow[],
	now: Date = systemClock.now()
): number {
	const since = now.getTime() - 7 * DAY_MS;
	return tasks.filter((task) => {
		const at = timeOf(task.completedAt);
		return !Number.isNaN(at) && at >= since && at <= now.getTime();
	}).length;
}

/** One pass, each row in exactly one bucket — counts can never double-book. */
export function splitTasksByRecurrence<T extends { readonly recurrenceFrequency?: string | null }>(
	rows: readonly T[]
): { recurring: T[]; oneOff: T[] } {
	const recurring: T[] = [];
	const oneOff: T[] = [];
	for (const row of rows) (row.recurrenceFrequency != null ? recurring : oneOff).push(row);
	return { recurring, oneOff };
}

/**
 * The day's completed rows, newest first: the viewer's one-off Tasks that are
 * currently completed plus the recurring check-offs recovered from the history
 * table. A row with no instant sorts last (legacy treated it as epoch 0), and
 * the input arrays are never mutated.
 */
export function mergeDayCompletions<T extends { readonly completedAt: string | null }>(
	oneOff: readonly T[],
	recurring: readonly T[]
): T[] {
	return [...oneOff, ...recurring].sort(
		(a, b) =>
			(b.completedAt ? Date.parse(b.completedAt) : 0) -
			(a.completedAt ? Date.parse(a.completedAt) : 0)
	);
}

/** Chip predicate: Family Tasks partition off first, then visibility. */
export function matchesTaskChip(task: TaskPageRow, chip: TaskChip): boolean {
	if (chip === 'all') return true;
	if (chip === 'family') return !!task.familyId;
	return !task.familyId && (task.visibility ?? 'public') === chip;
}

/**
 * Search matches the title, the notes, the tags and the assignee's name —
 * the stored name fields, plus the roster name for a bare id.
 */
export function matchesTaskSearch(
	task: TaskPageRow,
	query: string,
	memberName: (userId: string) => string
): boolean {
	const needle = query.trim().toLowerCase();
	if (!needle) return true;
	if (task.title.toLowerCase().includes(needle)) return true;
	if ((task.notes ?? '').toLowerCase().includes(needle)) return true;
	if ((task.tags ?? []).some((tag) => tag.toLowerCase().includes(needle))) return true;
	if (`${task.assigneeFirstName ?? ''} ${task.assigneeLastName ?? ''}`.toLowerCase().includes(needle))
		return true;
	if (task.assignedTo && memberName(task.assignedTo).toLowerCase().includes(needle)) return true;
	return false;
}

/** Prefix match: "gro" matches #groceries. */
export function matchesTaskTagFilter(
	tags: readonly string[] | null | undefined,
	filter: string
): boolean {
	const needle = filter.trim().toLowerCase();
	if (!needle) return true;
	return (tags ?? []).some((tag) => tag.toLowerCase().startsWith(needle));
}

/** The owner axis: `Mine` = handed to me, `Created by me` = my rows. */
export function taskInOwnerView(
	task: TaskPageRow,
	view: TaskOwnerView,
	currentUserId: string | undefined
): boolean {
	if (view === 'mine') return task.assignedTo === currentUserId;
	if (view === 'created') return task.userId === currentUserId;
	return true;
}

/** Display name for a roster id: the roster name, "You" for the viewer, else the id stub. */
export function taskMemberName(
	member: { readonly firstName: string; readonly lastName: string } | undefined,
	userId: string,
	currentUserId: string | undefined
): string {
	if (member) return `${member.firstName} ${member.lastName}`.trim();
	if (userId === currentUserId) return 'You';
	return userId.slice(0, 8);
}

/**
 * A `POST`/`PUT` answer as a list row: the wire carries no roster names, the
 * Event title or `eventStart`, so those start empty and the next re-read fills
 * them. The quick-add uses this for its optimistic insert.
 */
export function taskRowFromWire(wire: TaskWire | TaskWithTagsWire): TaskPageRow {
	const tags = 'tags' in wire ? wire.tags : [];
	return {
		id: wire.id,
		title: wire.title,
		notes: wire.notes,
		dueDate: wire.dueDate,
		completedAt: wire.completedAt,
		recurrenceFrequency: wire.recurrenceFrequency,
		recurrenceInterval: wire.recurrenceInterval,
		completionCount: wire.completionCount,
		assignedTo: wire.assignedTo,
		assignmentStatus: wire.assignmentStatus,
		priority: wire.priority,
		visibility: wire.visibility,
		userId: wire.userId,
		familyId: wire.familyId,
		eventId: wire.eventId,
		focusMinutes: wire.focusMinutes,
		focusStartedAt: wire.focusStartedAt,
		category: wire.category,
		createdAt: wire.createdAt,
		tags,
		assigneeFirstName: null,
		assigneeLastName: null,
		creatorFirstName: null,
		eventTitle: null,
		eventStart: null
	};
}
