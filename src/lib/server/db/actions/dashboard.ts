/**
 * Dashboard selectors — pure functions over task rows (no DB access).
 * Lives apart from the tasks actions so ranking rules are unit-testable.
 */

export type TaskPriority = 'low' | 'normal' | 'high';
export const TASK_PRIORITIES = ['low', 'normal', 'high'] as const;
export const PRIORITY_WEIGHT: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

/** A structural subset of a Task row — anything with these fields ranks. */
export interface RankableTask {
	id: string;
	title: string;
	dueDate: string | null;
	completedAt: string | null;
	priority: string;
	userId: string;
	assignedTo: string | null;
	assignmentStatus: string | null;
	archivedAt?: string | null;
}

export interface RankOpts {
	/** Start of the viewer's current day (user-timezone boundary), as ISO. Defaults to now (then UTC-based today). */
	todayStartIso?: string;
	/** Max tasks to return. Default 3. */
	limit?: number;
}

/**
 * Order the open task pool for the "Top-3 Priorities" card.
 *
 * First, the viewer's own tasks (assigned to them, or unassigned and created
 * by them); then priority high → normal → low; then urgency bucket
 * overdue → due-today → next-due → no-due; then earliest due date; then title.
 */
export function rankTop3(tasks: RankableTask[], viewerId: string, opts: RankOpts = {}): RankableTask[] {
	const { limit = 3 } = opts;
	const todayStart = Date.parse(opts.todayStartIso ?? new Date().toISOString());
	const tomorrow = todayStart + 86_400_000;

	const eligible = tasks.filter((t) => !t.completedAt && !t.archivedAt);

	const scored = eligible.map((t) => {
		const priority = PRIORITY_WEIGHT[t.priority as TaskPriority] ?? PRIORITY_WEIGHT.normal;
		const due = t.dueDate ? Date.parse(t.dueDate) : null;
		let bucket: number;
		if (due == null) bucket = 3; // no due
		else if (due < todayStart) bucket = 0; // overdue
		else if (due < tomorrow) bucket = 1; // due today
		else bucket = 2; // next
		const mine = t.userId === viewerId || t.assignedTo === viewerId;
		return { t, priority, due, bucket, mine };
	});

	scored.sort((a, b) => {
		if (a.mine !== b.mine) return a.mine ? -1 : 1;
		if (a.priority !== b.priority) return a.priority - b.priority;
		if (a.bucket !== b.bucket) return a.bucket - b.bucket;
		const aDue = a.due ?? Number.MAX_SAFE_INTEGER;
		const bDue = b.due ?? Number.MAX_SAFE_INTEGER;
		if (aDue !== bDue) return aDue - bDue;
		return a.t.title.localeCompare(b.t.title);
	});

	return scored.slice(0, limit).map((s) => s.t);
}