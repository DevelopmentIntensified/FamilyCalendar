/**
 * familyHub board rules: the `/family/tasks` decisions that are not the
 * grouping. Which empty state a tab shows, how many handoffs are waiting for
 * the viewer, and the Public tab's label — all pure, all from counts the load
 * already produced.
 *
 * Grouping is NOT here: one column per assignee (viewer first, then name;
 * urgency inside a column), the Nobody card and the "no empty column" rule are
 * `tasks`' `groupFamilyBoard`, because the Day Dashboard card renders the same
 * board. This screen renders what that rule returns and adds no second split.
 *
 * Doc: ./README.md#invariants
 */

/** The board's two scopes (issue 019); the Public one is read-only. */
export type BoardTab = 'family' | 'public';

/**
 * Which state the active tab renders. `board` is the ordinary one; the other
 * four are the empty states, kept apart because each says a different thing
 * about why there is nothing to see.
 */
export type BoardEmptyState =
	| { readonly kind: 'board' }
	/** Nothing matches the tag filter — name the tag so the reader can clear it. */
	| { readonly kind: 'no-match'; readonly tag: string }
	/** This family has no Tasks at all yet. */
	| { readonly kind: 'no-family-tasks' }
	/** Everything the filter admits is done: "All caught up 🎉". */
	| { readonly kind: 'all-caught-up' }
	/** The Public tab has nothing public to show. */
	| { readonly kind: 'no-public-tasks' };

/** The counts the board already computed, before it decides what to render. */
export type BoardEmptyFacts = {
	readonly tab: BoardTab;
	/** Open Tasks left after the tag filter — the columns and the Nobody card. */
	readonly open: number;
	/** Completed Tasks left after the tag filter — the completed list. */
	readonly completed: number;
	/** The Public tab's row count (the tab's label and its empty state). */
	readonly publicCount: number;
	/** The raw tag-filter input; whitespace-only is no filter. */
	readonly tagFilter: string;
};

/**
 * Which of the five states the active tab renders, in the legacy order:
 * an empty family tab under a filter says "no match" (not "no tasks yet");
 * an empty family tab without one says "no family tasks yet"; a family tab
 * with only completed rows says "all caught up"; the Public tab says
 * "no public tasks yet" and ignores the tag filter (the filter belongs to the
 * Family tab, which is the only tab that renders it).
 */
export function boardEmptyState(facts: BoardEmptyFacts): BoardEmptyState {
	if (facts.tab === 'public') {
		return facts.publicCount === 0 ? { kind: 'no-public-tasks' } : { kind: 'board' };
	}
	const tag = facts.tagFilter.trim();
	if (facts.open === 0 && facts.completed === 0) {
		return tag ? { kind: 'no-match', tag: tag.toLowerCase() } : { kind: 'no-family-tasks' };
	}
	// A filtered view that still shows completed rows is not "caught up": the
	// filter may be hiding open Tasks, so the legacy page stayed quiet.
	if (facts.open === 0 && !tag) return { kind: 'all-caught-up' };
	return { kind: 'board' };
}

/** The fields the pending banner reads off a Task row. */
export type PendingTask = {
	readonly assignedTo?: string | null;
	readonly assignmentStatus?: string | null;
	readonly completedAt?: string | null;
};

/**
 * The handoffs waiting for this viewer: open Tasks assigned to them with
 * `assignmentStatus = 'pending'`. Callers pass the open, tag-filtered list (the
 * banner counts what the board below it shows); the completed guard keeps the
 * rule honest if a wider list is ever handed in.
 */
export function pendingForViewer<T extends PendingTask>(
	tasks: readonly T[],
	viewerId: string
): T[] {
	return tasks.filter(
		(task) =>
			!task.completedAt &&
			task.assignedTo === viewerId &&
			task.assignmentStatus === 'pending'
	);
}

/** The Public tab's label: the count is part of the tab, not of the list. */
export function publicTabLabel(count: number): string {
	return `Public tasks (${count})`;
}

/** The fields the completed window reads off a Task row. */
export type CompletedWindowRow = {
	readonly completedAt?: string | null;
};

/**
 * Q-091 (owner, 2026-11-12): the page keeps the newest 50 completed Tasks and
 * the heading counts every one of them. `limit` null keeps the whole list —
 * what the `/api` twin must still answer. Open rows are never windowed, and
 * the surviving rows keep the read's order, so a family under the limit
 * renders exactly as before.
 */
export function windowCompletedTasks<T extends CompletedWindowRow>(
	rows: readonly T[],
	limit: number | null
): { tasks: readonly T[]; completedTotal: number } {
	const completedTotal = rows.reduce((count, row) => (row.completedAt ? count + 1 : count), 0);
	if (limit === null) return { tasks: rows, completedTotal };
	let kept = 0;
	const tasks = rows.filter((row) => {
		if (!row.completedAt) return true;
		if (kept >= limit) return false;
		kept += 1;
		return true;
	});
	return { tasks, completedTotal };
}

