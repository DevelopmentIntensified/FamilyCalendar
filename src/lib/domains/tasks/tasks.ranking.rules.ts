/**
 * tasks ranking rules: the one open-Task order (legacy
 * `dashboard.rankTop3` + `taskSort.PRIORITY_ORDER`). The Day Dashboard's Top-3
 * Priorities and the Family Task Board sort through it, so the two lists
 * cannot drift.
 *
 * Order: the viewer's own rows first (owner or current assignee), then
 * priority (high → normal → low, an unknown priority counting as normal), then
 * urgency bucket (overdue → due today → next due → no due), then earliest due,
 * then title. Completed and archived rows never rank.
 *
 * Pure: `todayStart` (the viewer's local day boundary) is a parameter (rule
 * R5); nothing here reads the clock.
 *
 * Doc: ./README.md#invariants
 */

/** Ranking weight: lower sorts first. */
const PRIORITY_WEIGHT: Record<'high' | 'normal' | 'low', number> = {
	high: 0,
	normal: 1,
	low: 2
};

const ONE_DAY_MS = 86_400_000;

/** What ranking reads off a Task row. */
export type TaskRankRow = {
	readonly title: string;
	readonly dueDate: string | Date | null;
	readonly priority: string | null;
	readonly completedAt: string | Date | null;
	readonly archivedAt: string | Date | null;
	readonly userId: string;
	readonly assignedTo: string | null;
};

export type TaskRankOptions = {
	/** Start of the viewer's current day (their zone), as an instant or ISO string. */
	readonly todayStart: Date | string;
	/** Max rows to return; absent means the whole ordered list. */
	readonly limit?: number;
};

/**
 * Order the open task pool and optionally take its head. `limit: 3` is the
 * Top-3 Priorities slice; no limit is the list order.
 *
 * The "due today" bucket is `due < todayStart + 24h` — legacy's fixed 24-hour
 * offset, not the next calendar midnight, kept as today's order.
 */
export function rankTasks<T extends TaskRankRow>(
	tasks: readonly T[],
	viewerId: string,
	options: TaskRankOptions
): T[] {
	const todayStart = Date.parse(
		typeof options.todayStart === 'string' ? options.todayStart : options.todayStart.toISOString()
	);
	const tomorrow = todayStart + ONE_DAY_MS;

	const scored = tasks
		.filter((task) => !task.completedAt && !task.archivedAt)
		.map((task) => {
			const priority =
				task.priority === 'high' || task.priority === 'low'
					? PRIORITY_WEIGHT[task.priority]
					: PRIORITY_WEIGHT.normal;
			const due = task.dueDate ? Date.parse(String(task.dueDate)) : null;
			const bucket =
				due === null || Number.isNaN(due)
					? 3
					: due < todayStart
						? 0
						: due < tomorrow
							? 1
							: 2;
			const mine = task.userId === viewerId || task.assignedTo === viewerId;
			return { task, priority, due: due === null || Number.isNaN(due) ? null : due, bucket, mine };
		});

	scored.sort((a, b) => {
		if (a.mine !== b.mine) return a.mine ? -1 : 1;
		if (a.priority !== b.priority) return a.priority - b.priority;
		if (a.bucket !== b.bucket) return a.bucket - b.bucket;
		const aDue = a.due ?? Number.MAX_SAFE_INTEGER;
		const bDue = b.due ?? Number.MAX_SAFE_INTEGER;
		if (aDue !== bDue) return aDue - bDue;
		return a.task.title.localeCompare(b.task.title);
	});

	const ordered = scored.map((entry) => entry.task);
	return options.limit === undefined ? ordered : ordered.slice(0, options.limit);
}
