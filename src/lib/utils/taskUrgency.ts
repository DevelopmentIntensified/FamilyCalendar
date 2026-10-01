/**
 * Urgency for the FLAT personal task list (issue 101, decision 2).
 *
 * The list has no Overdue / Today / Up next bands, so this module is the whole
 * of "what is urgent": one bucket per Task, one comparator, and the "3 days
 * late" chip a row prints about itself. Time is a filter state (the jump bar)
 * and a sort key — never a section.
 *
 * Pure + clock-only (reads `new Date()`), so both surfaces and their tests
 * share one definition.
 */
import { isDueToday, isOverdue, startOfToday } from './priorityTone';
import { sortTasks, type TaskSortKey } from './taskSort';

export type UrgencyBucket = 'overdue' | 'today' | 'upnext' | 'done';

/** The jump bar's filter state: 'all', or one of the four buckets. */
export type TimeFilter = 'all' | UrgencyBucket;

/** Jump-bar labels, in the order the bar prints them. */
export const TIME_FILTERS: { value: TimeFilter; label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'overdue', label: 'Overdue' },
	{ value: 'today', label: 'Today' },
	{ value: 'upnext', label: 'Up next' },
	{ value: 'done', label: 'Done' }
];

const BUCKET_RANK: Record<UrgencyBucket, number> = { overdue: 0, today: 1, upnext: 2, done: 3 };

/** The structural shape every urgency helper reads. */
export interface UrgencyTask {
	title: string;
	dueDate?: string | Date | null;
	completedAt?: string | Date | null;
	createdAt?: string | Date | number | null;
	priority?: string | null;
}

/**
 * Where a Task sits in time. A finished Task is `done` whatever its date says —
 * it is not late for being completed.
 */
export function urgencyBucket(task: UrgencyTask): UrgencyBucket {
	if (task.completedAt) return 'done';
	if (isOverdue(task.dueDate)) return 'overdue';
	if (isDueToday(task.dueDate)) return 'today';
	return 'upnext';
}

function dueTime(task: UrgencyTask): number {
	if (!task.dueDate) return Number.POSITIVE_INFINITY;
	const t =
		task.dueDate instanceof Date ? task.dueDate.getTime() : new Date(task.dueDate).getTime();
	return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/** Whole days between today and a past due date. 0 when it is not overdue. */
export function lateDays(due: string | Date | null | undefined): number {
	if (!due || !isOverdue(due)) return 0;
	const d = due instanceof Date ? new Date(due.getTime()) : new Date(due);
	if (Number.isNaN(d.getTime())) return 0;
	d.setHours(0, 0, 0, 0);
	return Math.max(1, Math.round((startOfToday().getTime() - d.getTime()) / 86_400_000));
}

/** The row's own overdue state: "1 day late" / "N days late", or nothing. */
export function lateChip(due: string | Date | null | undefined): string | null {
	const n = lateDays(due);
	return n === 0 ? null : `${n} ${n === 1 ? 'day' : 'days'} late`;
}

/** overdue → today → up next → done, then by due date, undated last. */
export function compareUrgency(a: UrgencyTask, b: UrgencyTask): number {
	const ra = BUCKET_RANK[urgencyBucket(a)];
	const rb = BUCKET_RANK[urgencyBucket(b)];
	if (ra !== rb) return ra - rb;
	return (
		dueTime(a) - dueTime(b) || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
	);
}

/**
 * The flat list's comparator. One continuous list, so a finished Task always
 * sorts after every open one whatever the sort key says — otherwise a task
 * completed today from last month's due date would open the list. Every other
 * key is an absolute override (as in the prototype): pick A–Z and you get A–Z,
 * and the row's own date is what still says "late".
 */
export function sortFlatTasks(a: UrgencyTask, b: UrgencyTask, key: TaskSortKey): number {
	const doneA = a.completedAt ? 1 : 0;
	const doneB = b.completedAt ? 1 : 0;
	if (doneA !== doneB) return doneA - doneB;
	if (key === 'urgency') return compareUrgency(a, b);
	return sortTasks(a, b, key) || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
}

/** What the jump bar prints: how many Tasks sit in each bucket. */
export function bucketCounts<T extends UrgencyTask>(
	tasks: readonly T[]
): Record<UrgencyBucket, number> {
	const counts: Record<UrgencyBucket, number> = { overdue: 0, today: 0, upnext: 0, done: 0 };
	for (const t of tasks) counts[urgencyBucket(t)] += 1;
	return counts;
}
